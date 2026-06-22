import { classifyBucket, isInterestingBucket } from "./activitywatch.js";

export async function buildSnapshot({ awClient, skills = [], aqua = null, gog = null, days = 1, now = new Date() }) {
  const end = now.toISOString();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const snapshot = {
    generatedAt: now.toISOString(),
    range: { start, end, days },
    sources: {
      activitywatch: { ok: false, buckets: 0, events: 0, error: null },
      aqua: aqua || { ok: false, configured: false },
      gog: gog || { ok: false, installed: false },
      skills: { ok: true, count: skills.length },
    },
    activity: [],
    whoop: [],
    youtube: [],
    presence: [],
    afk: [],
    skills: summarizeSkills(skills),
  };

  let buckets;
  try {
    buckets = await awClient.buckets();
    snapshot.sources.activitywatch.ok = true;
    snapshot.sources.activitywatch.buckets = Object.keys(buckets).length;
  } catch (err) {
    snapshot.sources.activitywatch.error = err instanceof Error ? err.message : String(err);
    return snapshot;
  }

  const interesting = Object.entries(buckets).filter(([id, bucket]) =>
    isInterestingBucket(id, bucket),
  );

  for (const [bucketId, bucket] of interesting) {
    let events = [];
    try {
      events = await awClient.events(bucketId, { start, end, limit: 2000 });
    } catch {
      continue;
    }
    snapshot.sources.activitywatch.events += events.length;
    const kind = classifyBucket(bucketId, bucket);
    if (kind === "whoop") snapshot.whoop.push(summarizeWhoopBucket(bucketId, events));
    else if (kind === "youtube") snapshot.youtube.push(summarizeYoutubeBucket(bucketId, events));
    else if (kind === "presence") snapshot.presence.push(summarizePresenceBucket(bucketId, events));
    else if (kind === "afk") snapshot.afk.push(summarizeGenericBucket(bucketId, events));
    else if (kind === "activity") snapshot.activity.push(summarizeActivityBucket(bucketId, events));
  }

  snapshot.activity.sort((a, b) => b.totalSeconds - a.totalSeconds);
  snapshot.whoop.sort((a, b) => a.bucketId.localeCompare(b.bucketId));
  snapshot.youtube.sort((a, b) => b.totalSeconds - a.totalSeconds);
  return snapshot;
}

export function snapshotToMarkdown(snapshot) {
  const lines = [];
  lines.push("# Screenpipe Context Hub Snapshot");
  lines.push("");
  lines.push(`Generated: ${snapshot.generatedAt}`);
  lines.push(`Range: ${snapshot.range.start} to ${snapshot.range.end}`);
  lines.push("");
  lines.push("## Source Health");
  lines.push(
    `- ActivityWatch: ${snapshot.sources.activitywatch.ok ? "ok" : "offline"} (${snapshot.sources.activitywatch.buckets} buckets, ${snapshot.sources.activitywatch.events} events)`,
  );
  if (snapshot.sources.activitywatch.error) {
    lines.push(`  - Error: ${snapshot.sources.activitywatch.error}`);
  }
  lines.push(`- Aqua Voice export: ${snapshot.sources.aqua.ok ? "ok" : "offline"}`);
  lines.push(`- Gog Calendar CLI: ${snapshot.sources.gog.ok ? "ok" : "offline"}`);
  lines.push(`- Skills: ${snapshot.sources.skills.count} discovered`);
  lines.push("");

  addActivity(lines, snapshot.activity);
  addWhoop(lines, snapshot.whoop);
  addYoutube(lines, snapshot.youtube);
  addAqua(lines, snapshot.sources.aqua);
  addGog(lines, snapshot.sources.gog);
  addPresence(lines, snapshot.presence);
  addSkills(lines, snapshot.skills);
  return lines.join("\n");
}

export function memoryPayload(snapshot) {
  const tags = ["pipe:context-hub", "source:activitywatch"];
  if (snapshot.whoop.length) tags.push("source:whoop");
  if (snapshot.youtube.length) tags.push("source:youtube");
  if (snapshot.sources.aqua.ok) tags.push("source:aqua");
  if (snapshot.sources.gog.ok) tags.push("source:gog-calendar");
  if (snapshot.skills.total) tags.push("source:skills");
  return {
    content: snapshotToMarkdown(snapshot),
    source: "screenpipe-context-pipes",
    source_context: JSON.stringify({
      generatedAt: snapshot.generatedAt,
      range: snapshot.range,
      activitywatch: snapshot.sources.activitywatch,
    }),
    tags,
    importance: 0.65,
  };
}

function summarizeActivityBucket(bucketId, events) {
  const apps = new Map();
  let totalSeconds = 0;
  for (const event of events) {
    const seconds = Number(event.duration || 0);
    totalSeconds += seconds;
    const data = event.data || {};
    const app = data.app || data.title || data.name || "Unknown";
    apps.set(app, (apps.get(app) || 0) + seconds);
  }
  return {
    bucketId,
    eventCount: events.length,
    totalSeconds: round(totalSeconds),
    top: topMap(apps, 8),
  };
}

function summarizeWhoopBucket(bucketId, events) {
  const latest = [...events].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
  const metrics = {};
  for (const event of events) {
    const data = event.data || {};
    for (const key of [
      "recovery_score_percent",
      "recovery_score",
      "strain",
      "sleep_performance_percent",
      "resting_heart_rate_bpm",
      "heart_rate_variability_ms",
      "duration_minutes",
      "duration_hours",
    ]) {
      if (Number.isFinite(Number(data[key]))) metrics[key] = Number(data[key]);
    }
  }
  return {
    bucketId,
    eventCount: events.length,
    totalSeconds: round(sumDuration(events)),
    latestTimestamp: latest?.timestamp || null,
    latestType: latest?.data?.data_type || latest?.data?.activity_name || null,
    metrics,
  };
}

function summarizeYoutubeBucket(bucketId, events) {
  const channels = new Map();
  const titles = [];
  for (const event of events) {
    const data = event.data || {};
    if (data.channel) channels.set(data.channel, (channels.get(data.channel) || 0) + Number(event.duration || 0));
    if (data.title) titles.push(String(data.title).slice(0, 120));
  }
  return {
    bucketId,
    eventCount: events.length,
    totalSeconds: round(sumDuration(events)),
    topChannels: topMap(channels, 5),
    sampleTitles: [...new Set(titles)].slice(0, 5),
  };
}

function summarizePresenceBucket(bucketId, events) {
  const statuses = new Map();
  for (const event of events) {
    const status = event.data?.status || event.data?.label || "unknown";
    statuses.set(status, (statuses.get(status) || 0) + Number(event.duration || 0));
  }
  return {
    bucketId,
    eventCount: events.length,
    totalSeconds: round(sumDuration(events)),
    statuses: topMap(statuses, 8),
  };
}

function summarizeGenericBucket(bucketId, events) {
  return {
    bucketId,
    eventCount: events.length,
    totalSeconds: round(sumDuration(events)),
  };
}

function summarizeSkills(skills) {
  const tags = new Map();
  for (const skill of skills) {
    for (const tag of skill.tags || []) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  return {
    total: skills.length,
    tags: topMap(tags, 12),
    examples: skills
      .filter((skill) => (skill.tags || []).length)
      .slice(0, 20)
      .map((skill) => ({ id: skill.id, title: skill.title, tags: skill.tags })),
  };
}

function addActivity(lines, rows) {
  lines.push("## ActivityWatch Activity");
  if (!rows.length) {
    lines.push("- No app/window buckets found in range.");
  } else {
    for (const row of rows.slice(0, 5)) {
      lines.push(`- ${row.bucketId}: ${fmt(row.totalSeconds)} across ${row.eventCount} events`);
      for (const app of row.top.slice(0, 5)) lines.push(`  - ${app.name}: ${fmt(app.seconds)}`);
    }
  }
  lines.push("");
}

function addWhoop(lines, rows) {
  lines.push("## WHOOP");
  if (!rows.length) {
    lines.push("- No WHOOP buckets found in range.");
  } else {
    for (const row of rows) {
      const metricText = Object.entries(row.metrics)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      lines.push(`- ${row.bucketId}: ${row.eventCount} events, latest=${row.latestTimestamp || "n/a"}${metricText ? `, ${metricText}` : ""}`);
    }
  }
  lines.push("");
}

function addYoutube(lines, rows) {
  lines.push("## YouTube Sessions");
  if (!rows.length) {
    lines.push("- No YouTube session buckets found in range.");
  } else {
    for (const row of rows.slice(0, 5)) {
      lines.push(`- ${row.bucketId}: ${fmt(row.totalSeconds)}, ${row.eventCount} sessions`);
      for (const title of row.sampleTitles.slice(0, 3)) lines.push(`  - ${title}`);
    }
  }
  lines.push("");
}

function addPresence(lines, rows) {
  lines.push("## Presence");
  if (!rows.length) {
    lines.push("- No classified presence buckets found in range.");
  } else {
    for (const row of rows) {
      lines.push(`- ${row.bucketId}: ${fmt(row.totalSeconds)}`);
      for (const status of row.statuses) lines.push(`  - ${status.name}: ${fmt(status.seconds)}`);
    }
  }
  lines.push("");
}

function addAqua(lines, aqua) {
  lines.push("## Aqua Voice");
  if (!aqua?.ok) {
    lines.push(`- Not available: ${aqua?.error || "not configured"}.`);
  } else {
    lines.push(`- ${aqua.historyCount} recent transcription records indexed without transcript text.`);
    if (aqua.wordCount !== null) lines.push(`- Lifetime local word count: ${aqua.wordCount}`);
    if (aqua.totalAudioSeconds) lines.push(`- Recent audio duration: ${fmt(aqua.totalAudioSeconds)}`);
    if (aqua.latestTimestamp) lines.push(`- Latest record: ${aqua.latestTimestamp}`);
    if (aqua.model) lines.push(`- Transcription model: ${aqua.model}`);
    lines.push(`- Microphone profiles: ${aqua.microphoneProfiles}`);
    lines.push(`- Pending telemetry items: ${aqua.pendingTelemetryItems}`);
  }
  lines.push("");
}

function addGog(lines, gog) {
  lines.push("## Gog Calendar");
  if (!gog?.ok) {
    lines.push(`- Not available: ${gog?.error || "gog is not installed"}.`);
  } else {
    lines.push(`- Gog CLI available with credentials configured: ${gog.credentialsConfigured ? "yes" : "no"}.`);
    lines.push("- Calendar event titles/descriptions are not included in this public-safe digest.");
  }
  lines.push("");
}

function addSkills(lines, summary) {
  lines.push("## Local Skills");
  lines.push(`- ${summary.total} skills discovered`);
  if (summary.tags.length) {
    lines.push("- Top tags");
    for (const tag of summary.tags) lines.push(`  - ${tag.name}: ${tag.seconds}`);
  }
  if (summary.examples.length) {
    lines.push("- Example tagged skills");
    for (const skill of summary.examples.slice(0, 8)) {
      lines.push(`  - ${skill.id}: ${skill.tags.join(", ")}`);
    }
  }
  lines.push("");
}

function sumDuration(events) {
  return events.reduce((sum, event) => sum + Number(event.duration || 0), 0);
}

function topMap(map, limit) {
  return [...map.entries()]
    .map(([name, seconds]) => ({ name, seconds: round(seconds) }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);
}

function round(value) {
  return Math.round(Number(value || 0));
}

function fmt(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
