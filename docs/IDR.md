# IDR: Screenpipe Context Hub

## Decision

Build a Screenpipe pipe plus local connector CLI that turns existing local
metadata systems into Screenpipe memories. The first supported sources are
ActivityWatch, WHOOP data imported into ActivityWatch, YouTube watch-session
imports, Aqua Voice export metadata, Gog Calendar readiness, and local agent
skill inventories.

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
- Aqua Voice transcript text and raw audio are not exported into public config.
- Calendar event titles and descriptions are not exported into public config.

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
   app buckets, WHOOP buckets, YouTube sessions, Aqua metadata, Gog readiness,
   presence/status buckets.

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

## Public Configuration Contract

Decision:
Publish a redacted, derived config manifest instead of the user's raw
Screenpipe configuration.

Allowed:

- source type names
- Store pipe slugs
- redaction policy names
- capability flags
- coarse health status
- dry-run/write mode

Disallowed:

- secrets
- absolute local paths
- raw source payloads
- private skill bodies
- stable private IDs
- Aqua transcript text
- Calendar event text

## External-Data-Routing Design

Design:
Represent each input as a source-specific lane that can be assigned to a
bounded subagent.

Each lane:

- has one source responsibility
- emits a normalized summary
- drops private fields before handoff
- cannot mutate other sources' raw data

The final publisher is the only component that can write Screenpipe memories.
Default mode stays dry-run; writes remain explicit.

Current lanes:

- ActivityWatch lane for app/window and presence summaries.
- WHOOP lane for imported health bucket summaries.
- YouTube lane for watch-session summaries.
- Aqua lane for dictation metadata without transcript text.
- Gog Calendar lane for CLI readiness and future schedule summaries without
  event text.
- Skills lane for names, headings, and capability tags only.
- Discord voice lane for local-first meeting capture strategy.
- CMUX manager lane for future agent-status summaries.

## Discord / Voice Integration

Decision:
Support two modes only.

1. Local recording

- default
- botless
- captures microphone and system audio on the user's machine
- best match for Screenpipe's local-first model

2. vcvm bot

- fallback only
- opt-in
- private-network/authenticated transport only
- channel/server allowlist
- transcript-first, raw-audio-minimal

Rationale:
Local recording is the safest and most consistent with the existing botless
meeting model. vcvm bot mode is for headless or managed environments, not for
default consumer use.

## Non-Goals

- Directly writing rows into Screenpipe SQLite tables.
- Importing raw WHOOP OAuth data.
- Reading browser history.
- Publishing private ActivityWatch/WHOOP exports.
- Publishing Aqua transcript text or raw audio.
- Publishing calendar event text.
- Default Discord bot deployment.
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
