import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { classifyBucket } from "../src/activitywatch.js";
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
  assert.match(markdown, /Gog Calendar/);
  assert.ok(payload.tags.includes("source:whoop"));
  assert.ok(payload.tags.includes("source:aqua"));
  assert.ok(payload.tags.includes("source:gog-calendar"));
  assert.ok(payload.tags.includes("pipe:context-hub"));
});
