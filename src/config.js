import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_CONFIG = {
  activityWatchBaseUrl: "http://127.0.0.1:5600/api/0",
  screenpipeBaseUrl: "http://127.0.0.1:3030",
  skillRoots: ["~/.codex/skills", "~/.claude/skills", "~/.gemini/skills"],
  aquaExportDir: "~/Documents/AquaVoice_Export",
  gogCommand: "gog",
  privacy: {
    includeUrls: false,
    includeSkillBodies: false,
    includeAquaTranscriptText: false,
    includeCalendarEventText: false,
  },
};

export function expandHome(value) {
  if (!value || typeof value !== "string") return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function loadConfig(configPath) {
  const fileConfig = configPath
    ? JSON.parse(fs.readFileSync(expandHome(configPath), "utf8"))
    : {};
  return mergeConfig(DEFAULT_CONFIG, fileConfig);
}

function mergeConfig(base, override) {
  const out = { ...base, ...override };
  out.privacy = { ...base.privacy, ...(override.privacy || {}) };
  out.skillRoots = override.skillRoots || base.skillRoots;
  return out;
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function numberArg(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
