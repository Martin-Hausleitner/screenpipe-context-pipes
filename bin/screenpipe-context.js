#!/usr/bin/env node
import { ActivityWatchClient } from "../src/activitywatch.js";
import { readAquaExport } from "../src/aqua.js";
import { parseArgs, loadConfig, numberArg } from "../src/config.js";
import { readGogStatus } from "../src/gog.js";
import { inventorySkills } from "../src/skills.js";
import { buildSnapshot, memoryPayload, snapshotToMarkdown } from "../src/summarize.js";
import { ScreenpipeClient } from "../src/screenpipe.js";

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "help";

try {
  if (command === "help" || args.help) {
    printHelp();
  } else if (command === "doctor") {
    await doctor(args);
  } else if (command === "snapshot") {
    await snapshotCommand(args);
  } else if (command === "skills") {
    await skillsCommand(args);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}

async function doctor(args) {
  const config = loadConfig(args.config);
  const aw = new ActivityWatchClient(args.activitywatchUrl || config.activityWatchBaseUrl);
  const sp = new ScreenpipeClient(args.screenpipeUrl || config.screenpipeBaseUrl);
  const result = { activitywatch: null, screenpipe: null, aqua: null, gog: null, skills: null };

  try {
    result.activitywatch = { ok: true, info: await aw.info() };
  } catch (err) {
    result.activitywatch = { ok: false, error: err.message };
  }

  try {
    result.screenpipe = { ok: true, health: await sp.health() };
  } catch (err) {
    result.screenpipe = { ok: false, error: err.message };
  }

  result.aqua = readAquaExport(args.aquaExportDir || config.aquaExportDir);
  result.gog = readGogStatus({ command: args.gogCommand || config.gogCommand });

  const skills = inventorySkills(splitList(args.roots) || config.skillRoots, {
    includeBodies: false,
  });
  result.skills = { ok: true, count: skills.length };

  if (args.format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`ActivityWatch: ${result.activitywatch.ok ? "ok" : `offline (${result.activitywatch.error})`}`);
  console.log(`Screenpipe: ${result.screenpipe.ok ? "ok" : `offline (${result.screenpipe.error})`}`);
  console.log(`Aqua: ${result.aqua.ok ? "ok" : `offline (${result.aqua.error})`}`);
  console.log(`Gog Calendar: ${result.gog.ok ? "ok" : `offline (${result.gog.error})`}`);
  console.log(`Skills: ${result.skills.count}`);
}

async function snapshotCommand(args) {
  const config = loadConfig(args.config);
  const aw = new ActivityWatchClient(args.activitywatchUrl || config.activityWatchBaseUrl);
  const skills = inventorySkills(splitList(args.roots) || config.skillRoots, {
    includeBodies: Boolean(args.includeSkillBodies || config.privacy.includeSkillBodies),
  });
  const snapshot = await buildSnapshot({
    awClient: aw,
    skills,
    aqua: readAquaExport(args.aquaExportDir || config.aquaExportDir),
    gog: readGogStatus({ command: args.gogCommand || config.gogCommand }),
    days: numberArg(args.days, 1),
  });

  const payload = memoryPayload(snapshot);
  if (args.format === "json") {
    console.log(JSON.stringify(args.payload ? payload : snapshot, null, 2));
  } else {
    console.log(payload.content);
  }

  if (args.write) {
    const sp = new ScreenpipeClient(args.screenpipeUrl || config.screenpipeBaseUrl);
    const created = await sp.createMemory(payload);
    console.error(`Wrote Screenpipe memory: ${JSON.stringify(created)}`);
  }
}

async function skillsCommand(args) {
  const config = loadConfig(args.config);
  const skills = inventorySkills(splitList(args.roots) || config.skillRoots, {
    includeBodies: Boolean(args.includeSkillBodies),
  });
  if (args.format === "json") console.log(JSON.stringify(skills, null, 2));
  else {
    for (const skill of skills) {
      console.log(`${skill.id}\t${skill.tags.join(",")}\t${skill.title}`);
    }
  }
}

function splitList(value) {
  if (!value) return null;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`screenpipe-context

Usage:
  screenpipe-context doctor [--format json]
  screenpipe-context snapshot [--days 1] [--dry-run] [--write] [--format markdown|json]
  screenpipe-context skills [--format json]

Options:
  --config PATH              JSON config path
  --activitywatch-url URL    ActivityWatch API base
  --screenpipe-url URL       Screenpipe API base
  --roots A,B,C              Skill root directories
  --aqua-export-dir PATH     Aqua Voice export directory
  --gog-command PATH         Gog CLI command
  --write                    Write snapshot as Screenpipe memory
  --format FORMAT            markdown or json
`);
}
