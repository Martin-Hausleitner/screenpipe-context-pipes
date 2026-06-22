import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expandHome } from "./config.js";

export function readMeetilyStatus({ appPath = "/Applications/meetily.app" } = {}) {
  const resolvedAppPath = expandHome(appPath);
  const infoPath = path.join(resolvedAppPath, "Contents", "Info.plist");
  const installed = fs.existsSync(infoPath);
  if (!installed) {
    return {
      ok: false,
      installed: false,
      error: "Meetily app not installed",
    };
  }

  return {
    ok: true,
    installed: true,
    version: plistValue(infoPath, "CFBundleShortVersionString"),
    bundleId: plistValue(infoPath, "CFBundleIdentifier"),
    audioInputPermissionDeclared: plistValue(infoPath, "NSMicrophoneUsageDescription") !== null,
    systemAudioPermissionDeclared: plistValue(infoPath, "NSAudioCaptureUsageDescription") !== null,
    dataDirectoryDetected: detectDataDirectory(),
  };
}

function plistValue(infoPath, key) {
  try {
    return execFileSync("plutil", ["-extract", key, "raw", "-o", "-", infoPath], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function detectDataDirectory() {
  const candidates = [
    path.join(os.homedir(), "Library", "Application Support", "meetily"),
    path.join(os.homedir(), "Library", "Application Support", "com.meetily.ai"),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}
