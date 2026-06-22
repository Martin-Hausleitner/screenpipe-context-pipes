import fs from "node:fs";
import path from "node:path";
import { expandHome } from "./config.js";

export function readAquaExport(exportDir) {
  const dir = expandHome(exportDir);
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, configured: Boolean(dir), error: dir ? "export directory not found" : "not configured" };
  }

  const config = readJson(path.join(dir, "config_full.json"));
  const history = readJson(path.join(dir, "history_full.json"));
  const micTimings = readJson(path.join(dir, "mic_timings.json"));
  const outbox = readJson(path.join(dir, "session_outcome_v2_outbox.json"));

  const historyRows = Array.isArray(history) ? history : [];
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
    latestTimestamp: timestamps.at(-1) || null,
    totalAudioSeconds: Math.round(durations.reduce((sum, value) => sum + value, 0)),
    wordCount: numberOrNull(config?.wordCount),
    language: typeof config?.language === "string" ? config.language : null,
    model: typeof config?.transcriptionModel === "string" ? config.transcriptionModel : null,
    microphoneProfiles: micTimings && typeof micTimings === "object" ? Object.keys(micTimings).length : 0,
    pendingTelemetryItems: Array.isArray(outbox) ? outbox.length : 0,
  };
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
