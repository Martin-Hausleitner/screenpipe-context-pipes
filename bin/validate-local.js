#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";

import { ActivityWatchClient } from "../src/activitywatch.js";
import { readAquaExport } from "../src/aqua.js";
import { resolveBrowserPrivacyPolicy } from "../src/browser-privacy.js";
import { loadConfig, parseArgs } from "../src/config.js";
import { readGogStatus } from "../src/gog.js";
import { resolveMeetingCapturePolicy } from "../src/meeting-capture.js";
import { readMeetilyStatus } from "../src/meetily.js";
import { ScreenpipeClient } from "../src/screenpipe.js";
import { inventorySkills } from "../src/skills.js";
import { buildSnapshot, memoryPayload } from "../src/summarize.js";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const config = loadConfig(args.config);
const screenpipeBin = args.screenpipeBin || process.env.SCREENPIPE_BIN || "/Users/mh/.local/bin/screenpipe";
const uiUrl = args.uiUrl || process.env.SCREENPIPE_UI_URL || "http://127.0.0.1:5174";
const proofDir = path.resolve(args.proofDir || ".proof");
const startedAt = new Date();
const timings = {};
const checks = {};

try {
  const token = await timed("screenpipeAuthToken", async () => getScreenpipeToken());
  const headers = { Authorization: `Bearer ${token}` };

  const pipeList = await timed("pipeList", async () => command(screenpipeBin, ["pipe", "list"]));
  checks.pipes = summarizePipes(pipeList.stdout, [
    "context-hub",
    "day-recap",
    "obsidian-daily-summary",
    "meeting-intel",
    "voice-memos-sync",
    "personal-crm",
    "digital-clone",
  ]);

  const obsidianGet = await timed("obsidianGet", async () =>
    command(screenpipeBin, ["connection", "get", "obsidian"], { allowFailure: true }),
  );
  const obsidianTest = await timed("obsidianTest", async () =>
    command(screenpipeBin, ["connection", "test", "obsidian"], { allowFailure: true }),
  );
  const obsidianApi = await timed("obsidianApi", async () =>
    fetchJson(`${config.screenpipeBaseUrl}/connections/obsidian/config`, { headers }),
  );
  checks.obsidian = {
    connected: obsidianTest.code === 0,
    testMessage: compactLine(obsidianTest.stdout || obsidianTest.stderr),
    vaultPath: obsidianApi?.config?.vault_path || null,
    dailyNoteFolder: obsidianApi?.config?.daily_note_folder || null,
    cliHasVaultPath: obsidianGet.stdout.includes("vault_path:"),
  };
  checks.dailySummary = await timed("dailySummaryPreflight", async () =>
    dailySummaryPreflight({ config: obsidianApi?.config, headers, baseUrl: config.screenpipeBaseUrl }),
  );

  const sp = new ScreenpipeClient(config.screenpipeBaseUrl, { apiKey: token });
  const health = await timed("screenpipeHealth", async () => sp.health());
  const search = await timed("screenpipeSearch", async () =>
    fetchJson(`${config.screenpipeBaseUrl}/search?limit=1`, { headers }),
  );
  checks.screenpipeApi = {
    ok: Boolean(health),
    authorizedSearch: Array.isArray(search?.data),
    sampleCount: Array.isArray(search?.data) ? search.data.length : 0,
  };

  checks.webProxy = await timed("webProxy", async () => {
    try {
      const data = await fetchJson(`${uiUrl}/screenpipe-api/search?limit=1`);
      return {
        ok: Array.isArray(data?.data),
        sampleCount: Array.isArray(data?.data) ? data.data.length : 0,
      };
    } catch (err) {
      return { ok: false, error: compactLine(err.message) };
    }
  });

  const aw = new ActivityWatchClient(config.activityWatchBaseUrl);
  const aqua = readAquaExport(args.aquaExportDir || config.aquaExportDir, {
    includeTranscriptText: Boolean(config.privacy.includeAquaTranscriptText),
    transcriptLimit: config.privacy.aquaTranscriptLimit,
    transcriptMaxChars: config.privacy.aquaTranscriptMaxChars,
  });
  const meetily = readMeetilyStatus({ appPath: args.meetilyAppPath || config.meetilyAppPath });
  const gog = readGogStatus({ command: args.gogCommand || config.gogCommand });
  const skills = inventorySkills(config.skillRoots, { includeBodies: false });
  const snapshot = await timed("contextSnapshot", async () =>
    buildSnapshot({
      awClient: aw,
      skills,
      aqua,
      meetily,
      gog,
      screenpipeAudioAvailable: config.screenpipeAudioAvailable,
      days: Number(args.days || 1),
    }),
  );
  const payload = memoryPayload(snapshot);

  checks.contextHub = {
    activitywatchOk: snapshot.sources.activitywatch.ok,
    activitywatchBuckets: snapshot.sources.activitywatch.buckets,
    activitywatchEvents: snapshot.sources.activitywatch.events,
    aquaOk: snapshot.sources.aqua.ok,
    aquaTranscriptsIncluded: Boolean(snapshot.sources.aqua.transcriptsIncluded),
    aquaTranscriptCount: Number(snapshot.sources.aqua.transcriptCount || 0),
    aquaTranscriptTextChars: Number(snapshot.sources.aqua.transcriptTextChars || 0),
    meetilyOk: snapshot.sources.meetily.ok,
    meetilyVersion: snapshot.sources.meetily.version || null,
    gogOk: snapshot.sources.gog.ok,
    skillsCount: snapshot.sources.skills.count,
    skillTagCount: snapshot.skills.tags.length,
    sourceCounts: {
      activity: snapshot.activity.length,
      whoop: snapshot.whoop.length,
      youtube: snapshot.youtube.length,
      presence: snapshot.presence.length,
      afk: snapshot.afk.length,
    },
    memoryTags: payload.tags,
    writeBlocked: payload.writeBlocked,
    writeBlockReason: payload.writeBlockReason,
  };

  checks.meetingPolicy = resolveMeetingCapturePolicy({
    meetily,
    aqua,
    screenpipeAudioAvailable: config.screenpipeAudioAvailable,
  });
  checks.browserPrivacy = resolveBrowserPrivacyPolicy();

  const failures = collectFailures(checks);
  const proof = {
    generatedAt: startedAt.toISOString(),
    durationMs: Math.round(performance.now()),
    screenpipeBin,
    uiUrl,
    checks,
    timingsMs: timings,
    failures,
    ok: failures.length === 0,
    privacy: {
      privateContentStored: false,
      transcriptTextStored: false,
      urlsStored: false,
      rawAudioPathsStored: false,
    },
  };

  fs.mkdirSync(proofDir, { recursive: true });
  const proofPath = path.join(
    proofDir,
    `screenpipe-pipes-e2e-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({ ok: proof.ok, proofPath, failures, checks: compactForStdout(checks) }, null, 2));
  process.exitCode = proof.ok ? 0 : 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}

async function timed(name, fn) {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    timings[name] = Math.round(performance.now() - start);
  }
}

async function getScreenpipeToken() {
  if (process.env.SCREENPIPE_API_KEY) return process.env.SCREENPIPE_API_KEY;
  const { stdout } = await command(screenpipeBin, ["auth", "token"]);
  const token = stdout.trim();
  if (!token) throw new Error("screenpipe auth token returned an empty token");
  return token;
}

async function command(file, commandArgs, options = {}) {
  try {
    const result = await execFileAsync(file, commandArgs, {
      timeout: options.timeoutMs || 15000,
      maxBuffer: 1024 * 1024 * 8,
    });
    return { ...result, code: 0 };
  } catch (err) {
    if (options.allowFailure) {
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        code: Number.isInteger(err.code) ? err.code : 1,
      };
    }
    throw err;
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${url} failed (${response.status}): ${body.slice(0, 160)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function summarizePipes(output, required) {
  const rows = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(yes|no)\s+(.+?)\s{2,}(.+?)\s*$/);
    if (match) {
      rows.push({
        id: match[1],
        enabled: match[2] === "yes",
        schedule: match[3].trim(),
        lastRun: match[4].trim(),
      });
    }
  }
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  return {
    total: rows.length,
    required: Object.fromEntries(required.map((id) => [id, byId[id] || null])),
  };
}

function collectFailures(result) {
  const failures = [];
  for (const [id, pipe] of Object.entries(result.pipes.required)) {
    if (!pipe) failures.push(`missing pipe: ${id}`);
    else if (!pipe.enabled && id !== "day-recap") failures.push(`disabled pipe: ${id}`);
  }
  if (!result.obsidian.connected) failures.push("obsidian connection test failed");
  if (!result.obsidian.vaultPath) failures.push("obsidian vault_path missing");
  if (!result.dailySummary?.targetDirectoryWritable) failures.push("daily summary target directory is not writable");
  if (!result.dailySummary?.activitySummaryOk) failures.push("daily summary activity query failed");
  if (!result.dailySummary?.audioSearchOk) failures.push("daily summary audio query failed");
  if (!result.dailySummary?.inputSearchOk) failures.push("daily summary input query failed");
  if (!result.screenpipeApi.authorizedSearch) failures.push("screenpipe authorized search failed");
  if (!result.contextHub.activitywatchOk) failures.push("activitywatch snapshot failed");
  if (!result.contextHub.aquaTranscriptsIncluded) failures.push("aqua transcript export not included");
  if (!result.contextHub.meetilyOk) failures.push("meetily status unavailable");
  if (!result.contextHub.memoryTags.includes("source:skills")) failures.push("skills tag missing from context payload");
  if (result.meetingPolicy.primaryRecorder !== "meetily") failures.push("meeting policy does not prefer meetily");
  if (result.meetingPolicy.duplicateAudioRisk !== "low") failures.push("meeting duplicate audio risk is not low");
  const privateGuardConfigured =
    result.browserPrivacy.screenpipeRecordFlags.some((flag) => flag.includes("--ignored-windows")) &&
    result.browserPrivacy.screenpipeRecordFlags.includes("--disable-clipboard-capture") &&
    result.browserPrivacy.screenpipeRecordFlags.includes("--disable-keyboard-capture");
  if (!privateGuardConfigured) {
    failures.push("private browser screenpipe guard flags are not configured");
  }
  if (result.contextHub.writeBlocked && !result.contextHub.memoryTags.includes("privacy:write-blocked")) {
    failures.push("context payload is write-blocked without the privacy tag");
  }
  return failures;
}

function compactLine(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0] || "";
}

function compactForStdout(result) {
  return {
    pipes: {
      total: result.pipes.total,
      required: Object.fromEntries(
        Object.entries(result.pipes.required).map(([id, pipe]) => [
          id,
          pipe ? { enabled: pipe.enabled, schedule: pipe.schedule, lastRun: pipe.lastRun } : null,
        ]),
      ),
    },
    obsidian: result.obsidian,
    dailySummary: result.dailySummary,
    screenpipeApi: result.screenpipeApi,
    webProxy: result.webProxy,
    contextHub: {
      activitywatchOk: result.contextHub.activitywatchOk,
      activitywatchBuckets: result.contextHub.activitywatchBuckets,
      activitywatchEvents: result.contextHub.activitywatchEvents,
      aquaOk: result.contextHub.aquaOk,
      aquaTranscriptCount: result.contextHub.aquaTranscriptCount,
      meetilyOk: result.contextHub.meetilyOk,
      skillsCount: result.contextHub.skillsCount,
      sourceCounts: result.contextHub.sourceCounts,
      writeBlocked: result.contextHub.writeBlocked,
      memoryTags: result.contextHub.memoryTags,
    },
    meetingPolicy: result.meetingPolicy,
    browserPrivacy: result.browserPrivacy,
  };
}

async function dailySummaryPreflight({ config, headers, baseUrl }) {
  if (!config?.vault_path) {
    return {
      targetDirectoryWritable: false,
      activitySummaryOk: false,
      audioSearchOk: false,
      inputSearchOk: false,
      reason: "missing obsidian vault_path",
    };
  }
  const noteDir = path.join(config.vault_path, config.daily_note_folder || "");
  const today = new Date().toISOString().slice(0, 10);
  const notePath = path.join(noteDir, `${today}.md`);
  fs.mkdirSync(noteDir, { recursive: true });
  const tempPath = path.join(noteDir, ".screenpipe-daily-summary-write-test.tmp");
  fs.writeFileSync(tempPath, "ok\n");
  const targetDirectoryWritable = fs.existsSync(tempPath);
  fs.unlinkSync(tempPath);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const range = `start_time=${encodeURIComponent(startOfDay.toISOString())}&end_time=${encodeURIComponent(new Date().toISOString())}`;
  const activity = await fetchJson(`${baseUrl}/activity-summary?${range}`, { headers });
  const audio = await fetchJson(`${baseUrl}/search?content_type=audio&${range}&limit=10&min_length=50`, { headers });
  const input = await fetchJson(`${baseUrl}/search?content_type=input&${range}&limit=10`, { headers });

  return {
    notePath,
    existingNoteBytes: fs.existsSync(notePath) ? fs.statSync(notePath).size : 0,
    targetDirectoryWritable,
    activitySummaryOk: Array.isArray(activity?.apps) || Array.isArray(activity?.windows),
    activityApps: Array.isArray(activity?.apps) ? activity.apps.length : 0,
    activityWindows: Array.isArray(activity?.windows) ? activity.windows.length : 0,
    audioSearchOk: Array.isArray(audio?.data),
    audioItems: Array.isArray(audio?.data) ? audio.data.length : 0,
    inputSearchOk: Array.isArray(input?.data),
    inputItems: Array.isArray(input?.data) ? input.data.length : 0,
  };
}
