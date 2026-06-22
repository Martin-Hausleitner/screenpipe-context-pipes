---
schedule: "0 */2 * * *"
enabled: false
title: Context Hub
description: "Summarize ActivityWatch, WHOOP, YouTube, Aqua, Meetily, Gog Calendar, and local skill metadata into Screenpipe memories"
icon: "🧭"
allow-raw-sql: false
allow-frames: false
allow-content-types:
  - memory
---

Create a local context digest from non-screen metadata and save only the useful
facts as Screenpipe memories. Use Meetily as the preferred meeting recorder
signal when installed; Screenpipe audio should be fallback/context-only while
Meetily is active and fallback-only while Aqua handles dictation/import audio.

Use the local connector from this repository. If `run.sh` is available in this
pipe directory, prefer it because it can find or clone the public repository:

```bash
bash ./run.sh
```

Equivalent direct command:

```bash
node ./bin/screenpipe-context.js snapshot --days 1 --format markdown --dry-run
```

Review the digest. If it contains meaningful new information, save a compact
memory using the Screenpipe `/memories` API with tags:

- `pipe:context-hub`
- `source:activitywatch`
- `source:whoop` when WHOOP data appears
- `source:youtube` when YouTube sessions appear
- `source:aqua` when Aqua Voice export metadata appears
- `source:meetily` when Meetily is installed
- `policy:single-audio-recorder` when the audio arbitration policy is active
- `source:gog-calendar` when Gog Calendar CLI is configured
- `source:skills` when skill inventory appears

Do not save raw events, full URLs, private journal text, OAuth credentials,
calendar event titles/descriptions, Aqua transcript text, Meetily transcript
text/raw recordings, browser history rows, or sensitive personal content. Save
only the summary:

- top app/activity categories
- WHOOP recovery/sleep/workout highlights
- YouTube/session-level learning or media context
- Aqua Voice counts, freshness, duration, and transcription model metadata
- Meetily install status and single-audio-recorder policy
- Gog Calendar availability/freshness, without event text
- newly discovered local capabilities/skills
- data freshness and any source health issues

If ActivityWatch or Screenpipe is offline, report that clearly and do not invent
data.
