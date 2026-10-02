import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { classifyBucket } from "../src/activitywatch.js";
import { readAquaExport } from "../src/aqua.js";
import { resolveBrowserPrivacyPolicy } from "../src/browser-privacy.js";
import { resolveMeetingCapturePolicy } from "../src/meeting-capture.js";
import { inventorySkills } from "../src/skills.js";
import { buildSnapshot, memoryPayload, snapshotToMarkdown } from "../src/summarize.js";

test("classifies ActivityWatch buckets", () => {
  assert.equal(classifyBucket("aw-importer-whoop-sleep", { type: "whoop.sleep" }), "whoop");
  assert.equal(classifyBucket("aw-import-youtube-watch-sessions_host", {}), "youtube");
  assert.equal(classifyBucket("aw-classifier-presence-status", {}), "presence");
  assert.equal(classifyBucket("aw-watcher-window_host", { type: "currentwindow" }), "activity");
  assert.equal(classifyBucket("aw-watcher-afk_host", {}), "afk");
});

test("inventories skills without bodies by default", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "screenpipe-context-skills-"));
  const skillDir = path.join(root, "openclaw-whoop-activitywatch-import");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\ndescription: Import WHOOP data into ActivityWatch\n---\n# WHOOP Import\n\nPrivate instructions here.\n`,
  );
  const skills = inventorySkills([root]);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].id, "openclaw-whoop-activitywatch-import");
  assert.ok(skills[0].tags.includes("whoop"));
  assert.ok(skills[0].tags.includes("activitywatch"));
  assert.equal(skills[0].body, undefined);
});

test("exports Aqua transcript text without raw audio paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "screenpipe-context-aqua-"));
  fs.writeFileSync(
    path.join(root, "history_full.json"),
    JSON.stringify([
      {
        kind: "transcription",
        timestamp: "2026-01-02T10:00:00Z",
        content: "Clean transcript text",
        rawText: "clean transcript text",
        sessionId: 42,
        audioFilePath: "audio/private.wav",
        audioDurationSeconds: 4.2,
      },
    ]),
  );
  fs.writeFileSync(path.join(root, "config_full.json"), JSON.stringify({ wordCount: 3 }));
  fs.writeFileSync(path.join(root, "mic_timings.json"), JSON.stringify({ default: [] }));
  fs.writeFileSync(path.join(root, "session_outcome_v2_outbox.json"), JSON.stringify([]));

  const aqua = readAquaExport(root, { includeTranscriptText: true });
  assert.equal(aqua.ok, true);
  assert.equal(aqua.historyCount, 1);
  assert.equal(aqua.transcriptsIncluded, true);
  assert.equal(aqua.transcriptCount, 1);
  assert.equal(aqua.transcripts[0].text, "Clean transcript text");
  assert.equal(aqua.transcripts[0].audioDurationSeconds, 4.2);
  assert.equal(Object.hasOwn(aqua.transcripts[0], "audioFilePath"), false);
  assert.equal(JSON.stringify(aqua).includes("private.wav"), false);
});

test("builds snapshot and memory payload from mocked ActivityWatch", async () => {
  const awClient = {
    async buckets() {
      return {
        "aw-watcher-window_test": { type: "currentwindow" },
        "aw-importer-whoop-recovery": { type: "whoop.recovery" },
      };
    },
    async events(bucketId) {
      if (bucketId.includes("window")) {
        return [
          { timestamp: "2026-01-01T00:00:00Z", duration: 60, data: { app: "Codex" } },
          { timestamp: "2026-01-01T00:01:00Z", duration: 120, data: { app: "Comet" } },
        ];
      }
      return [
        {
          timestamp: "2026-01-01T08:00:00Z",
          duration: 60,
          data: { data_type: "recovery", recovery_score_percent: 91, hrv_rmssd_milli: 55 },
        },
      ];
    },
  };
  const snapshot = await buildSnapshot({
    awClient,
    aqua: {
      ok: true,
      historyCount: 2,
      latestTimestamp: "2026-01-01T09:00:00Z",
      totalAudioSeconds: 180,
      wordCount: 1200,
      model: "aqua",
      microphoneProfiles: 1,
      pendingTelemetryItems: 0,
      transcriptsIncluded: true,
      transcriptCount: 1,
      transcriptTextChars: 22,
      transcripts: [
        {
          timestamp: "2026-01-01T09:00:00Z",
          text: "Aqua exported transcript",
          audioDurationSeconds: 10,
        },
      ],
    },
    meetily: {
      ok: true,
      installed: true,
      version: "0.4.0",
      bundleId: "com.meetily.ai",
      audioInputPermissionDeclared: true,
      systemAudioPermissionDeclared: true,
      dataDirectoryDetected: false,
    },
    gog: {
      ok: true,
      credentialsConfigured: true,
    },
    skills: [{ id: "openclaw-activity-watch", title: "ActivityWatch", tags: ["activitywatch"] }],
    now: new Date("2026-01-02T00:00:00Z"),
  });
  const markdown = snapshotToMarkdown(snapshot);
  const payload = memoryPayload(snapshot);
  assert.match(markdown, /ActivityWatch Activity/);
  assert.match(markdown, /WHOOP/);
  assert.match(markdown, /Aqua Voice/);
  assert.match(markdown, /Aqua exported transcript/);
  assert.match(markdown, /Raw audio files and Aqua audio paths are excluded/);
  assert.match(markdown, /Meetily Meeting Capture/);
  assert.match(markdown, /Private Browser Policy/);
  assert.match(markdown, /Gog Calendar/);
  assert.ok(payload.tags.includes("source:whoop"));
  assert.ok(payload.tags.includes("source:aqua"));
  assert.ok(payload.tags.includes("source:meetily"));
  assert.ok(payload.tags.includes("source:gog-calendar"));
  assert.ok(payload.tags.includes("policy:single-audio-recorder"));
  assert.ok(payload.tags.includes("policy:private-browser-kill-switch"));
  assert.ok(payload.tags.includes("pipe:context-hub"));
  assert.equal(payload.writeBlocked, false);
});

test("prefers Meetily over Screenpipe audio for meeting capture", () => {
  const policy = resolveMeetingCapturePolicy({
    meetily: { ok: true },
    aqua: { ok: true },
    screenpipeAudioAvailable: true,
  });
  assert.equal(policy.primaryRecorder, "meetily");
  assert.equal(policy.screenpipeAudioRole, "fallback-and-context-only");
  assert.equal(policy.duplicateAudioRisk, "low");
});

test("blocks memory writes and drops browser activity when Cognitor private mode is detected", async () => {
  const awClient = {
    async buckets() {
      return {
        "aw-watcher-window_test": { type: "currentwindow" },
      };
    },
    async events() {
      return [
        {
          timestamp: "2026-01-01T10:00:00Z",
          duration: 60,
          data: { app: "Chromium", title: "Cognitor private browser session" },
        },
        {
          timestamp: "2026-01-01T10:01:00Z",
          duration: 120,
          data: { app: "Codex", title: "screenpipe-context-pipes" },
        },
      ];
    },
  };
  const snapshot = await buildSnapshot({
    awClient,
    now: new Date("2026-01-02T00:00:00Z"),
  });
  const markdown = snapshotToMarkdown(snapshot);
  const payload = memoryPayload(snapshot);
  assert.equal(snapshot.sources.browserPrivacy.active, true);
  assert.equal(payload.writeBlocked, true);
  assert.ok(payload.tags.includes("privacy:write-blocked"));
  assert.match(markdown, /memory writes blocked/);
  assert.equal(snapshot.activity[0].top.some((row) => row.name === "Chromium"), false);
});

test("private browser policy detects common browser private markers", () => {
  const policy = resolveBrowserPrivacyPolicy({
    events: [
      {
        timestamp: "2026-01-01T10:00:00Z",
        data: { app: "Google Chrome", title: "New Incognito Tab" },
      },
    ],
  });
  assert.equal(policy.active, true);
  assert.equal(policy.writeAction, "block-memory-write");
});
