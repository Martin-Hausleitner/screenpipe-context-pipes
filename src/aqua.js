import fs from "node:fs";
import path from "node:path";
import { expandHome } from "./config.js";

const TRANSCRIPT_TEXT_KEYS = [
  "content",
  "text",
  "transcript",
  "transcription",
  "transcriptText",
  "finalText",
  "rawText",
];

export function readAquaExport(exportDir, options = {}) {
  const dir = expandHome(exportDir);
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, configured: Boolean(dir), error: dir ? "export directory not found" : "not configured" };
  }

  const config = readJson(path.join(dir, "config_full.json"));
  const history = readJson(path.join(dir, "history_full.json"));
  const micTimings = readJson(path.join(dir, "mic_timings.json"));
  const outbox = readJson(path.join(dir, "session_outcome_v2_outbox.json"));

  const historyRows = Array.isArray(history) ? history : [];
  const transcripts = options.includeTranscriptText === false
    ? []
    : collectTranscripts(historyRows, {
        limit: positiveInteger(options.transcriptLimit, 100),
        maxChars: positiveInteger(options.transcriptMaxChars, 12000),
      });
  const durations = historyRows
    .map((row) => Number(row.audioDurationSeconds || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const timestamps = historyRows
    .map((row) => row.timestamp)
    .filter(Boolean)
    .sort();

  return {
    ok: true,
    configured: true,
    historyCount: historyRows.length,
    transcriptsIncluded: transcripts.length > 0,
    transcriptCount: transcripts.length,
    transcriptTextChars: transcripts.reduce((sum, item) => sum + item.text.length, 0),
    transcripts,
    latestTimestamp: timestamps.at(-1) || null,
    totalAudioSeconds: Math.round(durations.reduce((sum, value) => sum + value, 0)),
    wordCount: numberOrNull(config?.wordCount),
    language: typeof config?.language === "string" ? config.language : null,
    model: typeof config?.transcriptionModel === "string" ? config.transcriptionModel : null,
    microphoneProfiles: micTimings && typeof micTimings === "object" ? Object.keys(micTimings).length : 0,
    pendingTelemetryItems: Array.isArray(outbox) ? outbox.length : 0,
  };
}

function collectTranscripts(rows, { limit, maxChars }) {
  return rows
    .map((row) => normalizeTranscriptRow(row, maxChars))
    .filter(Boolean)
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
    .slice(0, limit);
}

function normalizeTranscriptRow(row, maxChars) {
  if (!row || typeof row !== "object") return null;
  const text = findText(row);
  if (!text) return null;
  const rawText = stringOrNull(row.rawText);
  return {
    kind: stringOrNull(row.kind),
    timestamp: stringOrNull(row.timestamp),
    sessionId: primitiveOrNull(row.sessionId),
    text: truncate(text, maxChars),
    rawText: rawText && rawText !== text ? truncate(rawText, maxChars) : null,
    textChars: text.length,
    rawTextChars: rawText ? rawText.length : 0,
    truncated: text.length > maxChars || Boolean(rawText && rawText.length > maxChars),
    audioDurationSeconds: numberOrNull(row.audioDurationSeconds),
  };
}

function findText(row) {
  for (const key of TRANSCRIPT_TEXT_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function primitiveOrNull(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function truncate(value, maxChars) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n[truncated]`;
}
