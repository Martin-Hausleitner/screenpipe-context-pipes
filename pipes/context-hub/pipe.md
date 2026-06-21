---
schedule: "0 */2 * * *"
enabled: false
title: Context Hub
description: "Summarize ActivityWatch, WHOOP, YouTube, and local skill metadata into Screenpipe memories"
icon: "🧭"
allow-raw-sql: false
allow-frames: false
allow-content-types:
  - memory
---

Create a local context digest from non-screen metadata and save only the useful
facts as Screenpipe memories.

Use the local connector from this repository:

```bash
node ./bin/screenpipe-context.js snapshot --days 1 --format markdown --dry-run
```

Review the digest. If it contains meaningful new information, save a compact
memory using the Screenpipe `/memories` API with tags:

- `pipe:context-hub`
- `source:activitywatch`
- `source:whoop` when WHOOP data appears
- `source:youtube` when YouTube sessions appear
- `source:skills` when skill inventory appears

Do not save raw events, full URLs, private journal text, OAuth credentials,
browser history rows, or sensitive personal content. Save only the summary:

- top app/activity categories
- WHOOP recovery/sleep/workout highlights
- YouTube/session-level learning or media context
- newly discovered local capabilities/skills
- data freshness and any source health issues

If ActivityWatch or Screenpipe is offline, report that clearly and do not invent
data.
