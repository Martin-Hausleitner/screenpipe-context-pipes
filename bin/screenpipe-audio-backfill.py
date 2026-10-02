#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import mimetypes
import os
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


DEFAULT_AUDIO_DB = Path.home() / ".screenpipe-audio-system" / "db.sqlite"
DEFAULT_SCREEN_DB = Path.home() / ".screenpipe" / "db.sqlite"
DEFAULT_ENDPOINT = "http://127.0.0.1:8767"
DEFAULT_PROOF_DIR = Path(__file__).resolve().parents[1] / ".proof"
DEFAULT_FFMPEG = "/Users/mh/.local/bin/ffmpeg"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Transcribe pending Screenpipe audio chunks and infer source app metadata."
    )
    parser.add_argument("--audio-db", default=str(DEFAULT_AUDIO_DB))
    parser.add_argument("--screen-db", default=str(DEFAULT_SCREEN_DB))
    parser.add_argument("--endpoint", default=os.environ.get("PARAKEET_OPENAI_ENDPOINT", DEFAULT_ENDPOINT))
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--since-minutes", type=int, default=180)
    parser.add_argument("--start-time", default="")
    parser.add_argument("--end-time", default="")
    parser.add_argument("--proof", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--newest-first", action="store_true")
    parser.add_argument("--source-window-seconds", type=int, default=120)
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG", DEFAULT_FFMPEG))
    parser.add_argument("--silence-threshold", type=float, default=0.0005)
    return parser.parse_args()


def utc_cutoff(minutes: int) -> str:
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=minutes)
    return cutoff.strftime("%Y-%m-%dT%H:%M:%S+00:00")


def connect(path: str) -> sqlite3.Connection:
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("pragma busy_timeout=10000")
    return con


def pending_chunks(
    con: sqlite3.Connection,
    start_time: str,
    end_time: str,
    limit: int,
    newest_first: bool,
) -> list[sqlite3.Row]:
    direction = "desc" if newest_first else "asc"
    end_clause = "and timestamp <= ? " if end_time else ""
    params: list[object] = [start_time]
    if end_time:
        params.append(end_time)
    params.append(limit)
    return con.execute(
        "select id, file_path, timestamp, transcription_attempts "
        "from audio_chunks "
        "where transcription_status = 'pending' "
        "and timestamp >= ? "
        f"{end_clause}"
        "and file_path is not null "
        f"order by timestamp {direction} "
        "limit ?",
        params,
    ).fetchall()


def multipart_body(field: str, path: Path) -> tuple[bytes, str]:
    boundary = f"----screenpipe-backfill-{uuid.uuid4().hex}"
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    data = path.read_bytes()
    parts = [
        f"--{boundary}\r\n".encode(),
        (
            f'Content-Disposition: form-data; name="{field}"; '
            f'filename="{path.name}"\r\nContent-Type: {mime}\r\n\r\n'
        ).encode(),
        data,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def transcribe(endpoint: str, path: Path) -> str:
    body, content_type = multipart_body("file", path)
    req = urllib.request.Request(
        endpoint.rstrip("/") + "/v1/audio/transcriptions",
        data=body,
        headers={"content-type": content_type},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=140) as res:
        payload = json.loads(res.read().decode("utf-8"))
    if "error" in payload:
        raise RuntimeError(json.dumps(payload["error"], ensure_ascii=False))
    return str(payload.get("text") or "").strip()


def audio_max_level(ffmpeg: str, path: Path) -> float | None:
    if path.stat().st_size < 4096:
        return 0.0
    proc = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-i",
            str(path),
            "-af",
            "astats=metadata=1:reset=1",
            "-f",
            "null",
            "-",
        ],
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
        check=False,
    )
    levels = [
        abs(float(match.group(1)))
        for match in re.finditer(r"Max level:\s+(-?\d+(?:\.\d+)?)", proc.stderr)
    ]
    return max(levels) if levels else None


def epoch(timestamp: str) -> int | None:
    try:
        normalized = timestamp.replace("Z", "+00:00")
        return int(dt.datetime.fromisoformat(normalized).timestamp())
    except Exception:
        return None


def infer_source(
    screen_con: sqlite3.Connection | None,
    timestamp: str,
    window_seconds: int,
) -> dict:
    if screen_con is None:
        return {
            "source_app": None,
            "source_window": None,
            "source_confidence": 0.0,
            "source_reason": "screen_db_unavailable",
            "speaker": None,
            "speaker_source": "not_available",
        }
    ts = epoch(timestamp)
    if ts is None:
        return {
            "source_app": None,
            "source_window": None,
            "source_confidence": 0.0,
            "source_reason": "invalid_audio_timestamp",
            "speaker": None,
            "speaker_source": "not_available",
        }
    rows = screen_con.execute(
        "select id, timestamp, app_name, window_name, focused, "
        "abs(cast(strftime('%s', timestamp) as integer) - ?) as delta_seconds "
        "from frames "
        "where cast(strftime('%s', timestamp) as integer) between ? and ? "
        "and app_name is not null "
        "order by delta_seconds asc, focused desc "
        "limit 24",
        (ts, ts - window_seconds, ts + window_seconds),
    ).fetchall()
    if not rows:
        return {
            "source_app": None,
            "source_window": None,
            "source_confidence": 0.0,
            "source_reason": "no_nearby_frame",
            "speaker": None,
            "speaker_source": "not_available",
        }
    row = next(
        (
            candidate
            for candidate in rows
            if candidate["app_name"] == "Discord"
            or (candidate["window_name"] and "Discord" in candidate["window_name"])
        ),
        rows[0],
    )
    app = row["app_name"]
    window = row["window_name"]
    delta = float(row["delta_seconds"] or 0)
    confidence = max(0.15, 1.0 - (delta / max(window_seconds, 1)))
    reason = "preferred_discord_frame" if app == "Discord" or (window and "Discord" in window) else "nearest_screen_frame"
    if reason == "preferred_discord_frame":
        confidence = max(confidence, 0.85)
    return {
        "source_app": app,
        "source_window": window,
        "source_confidence": round(confidence, 3),
        "source_delta_seconds": delta,
        "source_reason": reason,
        "speaker": None,
        "speaker_source": "not_available_from_system_audio_without_diarization_or_discord_voice_events",
    }


def update_chunk(
    con: sqlite3.Connection,
    chunk: sqlite3.Row,
    text: str,
    dry_run: bool,
) -> str:
    if dry_run:
        return "would_transcribe" if text else "would_mark_silent"
    attempts = int(chunk["transcription_attempts"] or 0) + 1
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    if text:
        con.execute(
            "insert into audio_transcriptions ("
            "audio_chunk_id, offset_index, timestamp, transcription, device, "
            "is_input_device, speaker_id, transcription_engine, start_time, "
            "end_time, text_length"
            ") values (?, 0, ?, ?, 'System Audio', 0, null, 'OpenAICompatible', 0.0, null, ?)",
            (chunk["id"], chunk["timestamp"], text, len(text)),
        )
        con.execute(
            "update audio_chunks "
            "set transcription_status = 'transcribed', "
            "transcription_attempts = ?, "
            "last_transcription_attempt_at = ?, "
            "transcription_failure_reason = null "
            "where id = ?",
            (attempts, now, chunk["id"]),
        )
        return "transcribed"
    con.execute(
        "update audio_chunks "
        "set transcription_status = 'silent', "
        "transcription_attempts = ?, "
        "last_transcription_attempt_at = ?, "
        "transcription_failure_reason = null "
        "where id = ?",
        (attempts, now, chunk["id"]),
    )
    return "silent"


def main() -> int:
    args = parse_args()
    proof_path = Path(args.proof) if args.proof else DEFAULT_PROOF_DIR / (
        "screenpipe-audio-backfill-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json"
    )
    proof_path.parent.mkdir(parents=True, exist_ok=True)

    audio_con = connect(args.audio_db)
    screen_con = connect(args.screen_db) if Path(args.screen_db).exists() else None
    start_time = args.start_time or utc_cutoff(args.since_minutes)
    end_time = args.end_time
    chunks = pending_chunks(audio_con, start_time, end_time, args.limit, args.newest_first)
    results = []

    for chunk in chunks:
        path = Path(chunk["file_path"])
        item = {
            "chunk_id": chunk["id"],
            "timestamp": chunk["timestamp"],
            "file_exists": path.exists(),
            "status": "pending",
        }
        item.update(infer_source(screen_con, chunk["timestamp"], args.source_window_seconds))
        if not path.exists():
            item["status"] = "missing_file"
            results.append(item)
            continue
        try:
            max_level = audio_max_level(args.ffmpeg, path)
        except (subprocess.SubprocessError, OSError, ValueError) as exc:
            max_level = None
            item["level_check_error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
        item["audio_max_level"] = max_level
        if max_level is not None and max_level < args.silence_threshold:
            item["status"] = update_chunk(audio_con, chunk, "", args.dry_run)
            item["silence_threshold"] = args.silence_threshold
            if not args.dry_run:
                audio_con.commit()
            results.append(item)
            continue
        start = time.time()
        try:
            text = transcribe(args.endpoint, path)
            item["transcription_text_length"] = len(text)
            item["status"] = update_chunk(audio_con, chunk, text, args.dry_run)
            item["elapsed_seconds"] = round(time.time() - start, 3)
            if not args.dry_run:
                audio_con.commit()
        except (urllib.error.URLError, TimeoutError, RuntimeError, sqlite3.Error) as exc:
            audio_con.rollback()
            item["status"] = "failed"
            item["error_type"] = type(exc).__name__
            item["error"] = str(exc)[:240]
        results.append(item)

    summary = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "audio_db": args.audio_db,
        "screen_db": args.screen_db if screen_con else None,
        "endpoint": args.endpoint,
        "dry_run": args.dry_run,
        "start_time": start_time,
        "end_time": end_time or None,
        "limit": args.limit,
        "newest_first": args.newest_first,
        "processed": len(results),
        "status_counts": {status: sum(1 for row in results if row["status"] == status) for status in sorted({row["status"] for row in results})},
        "discord_detected": any(row.get("source_app") == "Discord" for row in results),
        "speaker_note": "System Audio does not expose Discord speaker identity; speaker needs working diarization, Discord voice events, or per-speaker bot capture.",
        "results": results,
    }
    proof_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("processed", "status_counts", "discord_detected")}, ensure_ascii=False))
    print(str(proof_path))
    return 0 if not any(row["status"] == "failed" for row in results) else 2


if __name__ == "__main__":
    sys.exit(main())
