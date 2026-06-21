# IDR: Screenpipe Context Hub

## Decision

Build a Screenpipe pipe plus local connector CLI that turns existing local
metadata systems into Screenpipe memories. The first supported sources are
ActivityWatch, WHOOP data imported into ActivityWatch, YouTube watch-session
imports, and local agent skill inventories.

## Context

Screenpipe is strongest at screen/audio/UI recall. ActivityWatch is strongest
at structured app/window time. WHOOP and Apple Health-style data are already
normalized locally through existing importers. Local skills describe what an
agent can do but are scattered across agent-specific directories.

The desired system is not another tracker. It is a consolidation layer that
creates durable, searchable Screenpipe memories from already-local metadata.

## Constraints

- Public repo must not include personal data, tokens, private bucket exports, or
  local absolute paths beyond examples.
- Default execution must be read-only.
- Writes to Screenpipe must require an explicit `--write`.
- WHOOP OAuth and export downloading stay in the existing WHOOP importer.
- ActivityWatch remains source of truth for time-series metadata.

## Design

1. `pipes/context-hub/pipe.md`
   Scheduled/manual Screenpipe pipe prompt. It runs the connector, asks the
   agent to inspect the generated digest, and saves only high-signal facts.

2. `bin/screenpipe-context.js`
   Dependency-free Node CLI.

3. `src/activitywatch.js`
   Reads bucket metadata and events from ActivityWatch local API.

4. `src/summarize.js`
   Converts buckets/events into compact summaries:
   app buckets, WHOOP buckets, YouTube sessions, presence/status buckets.

5. `src/screenpipe.js`
   Optional memory writer using `POST /memories`.

6. `src/skills.js`
   Inventories local skills by folder name and first heading without copying
   full private skill content.

## Memory Shape

Screenpipe memories are tagged:

- `source:activitywatch`
- `source:whoop`
- `source:youtube`
- `source:skills`
- `pipe:context-hub`

The memory content is a compact Markdown digest, not raw event dumps.

## Non-Goals

- Directly writing rows into Screenpipe SQLite tables.
- Importing raw WHOOP OAuth data.
- Reading browser history.
- Publishing private ActivityWatch/WHOOP exports.
- Replacing existing AW importers.

## Validation

- `npm test`
- `screenpipe-context doctor`
- `screenpipe-context snapshot --dry-run`
- Optional: `SCREENPIPE_API_KEY="$(screenpipe auth token)" screenpipe-context snapshot --write`

## Open Questions

- Whether Screenpipe should eventually expose a first-class external-events
  endpoint instead of using memories for metadata summaries.
- Whether ActivityWatch bucket rollups should become timeline frames or remain
  memories.
- Whether source adapters should be published as separate packages once stable.
