# IDR: Screenpipe Context Hub

## Decision

Build a Screenpipe pipe plus local connector CLI that turns existing local
metadata systems into Screenpipe memories. The first supported sources are
ActivityWatch, WHOOP data imported into ActivityWatch, YouTube watch-session
imports, Aqua Voice export metadata and transcript text, Meetily meeting-capture status, Gog
Calendar readiness, browser-private/Cognitor privacy policy, and local agent
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
- Aqua Voice transcript text is exported only through the local/private connector;
  raw audio and audio paths are not exported.
- Aqua Voice transcript text and raw audio are not exported into public config.
- Meetily transcript text and raw recordings are not exported into public
  config.
- Calendar event titles and descriptions are not exported into public config.
- Only one meeting-audio recorder should be active for a meeting.
- Cognitor/private browser sessions must not produce Context Hub memories.

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
   app buckets, WHOOP buckets, YouTube sessions, Aqua transcripts and metadata, Meetily status,
   meeting-capture policy, browser privacy policy, Gog readiness,
   presence/status buckets.

5. `src/browser-privacy.js`
   Detects Cognitor/private browser window markers from ActivityWatch
   current-window metadata. Matching browser events are dropped and memory
   writes are blocked.

6. `src/screenpipe.js`
   Optional memory writer using `POST /memories`.

7. `src/skills.js`
   Inventories local skills by folder name and first heading without copying
   full private skill content.

## Memory Shape

Screenpipe memories are tagged:

- `source:activitywatch`
- `source:whoop`
- `source:youtube`
- `source:aqua`
- `source:meetily`
- `source:gog-calendar`
- `source:skills`
- `policy:single-audio-recorder`
- `policy:private-browser-kill-switch`
- `privacy:write-blocked`
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
- Aqua transcript text in public manifests or repository fixtures
- Meetily transcript text and raw recordings
- Calendar event text
- Cognitor/private browser events and browser history

## Browser Private Mode / Cognitor Policy

Decision:
Treat Cognitor launcher sessions and browser private modes as a memory-write
kill switch for the Context Hub.

Signals:

- `Cognitor`
- `CloakBrowser`
- `Incognito`
- `InPrivate`
- `Private Browsing`
- `Private Window`

Behavior:

1. Drop matching browser events before summary generation.
2. Add `policy:private-browser-kill-switch` to normal payloads.
3. Add `privacy:write-blocked` when a private/Cognitor signal appears.
4. Skip `--write` instead of calling the Screenpipe `/memories` API.
5. Recommend Screenpipe daemon hardening with ignored-window flags and disabled
   clipboard/keyboard capture.

Rationale:
Private browser use is a stronger boundary than ordinary redaction. A compact
summary is still a derived record, so the safe behavior is to not write one.

## Meeting Capture Arbitration

Decision:
Meetily is the preferred meeting recorder when installed. Aqua Voice is treated
as a dictation/import-audio metadata source. Screenpipe audio is a fallback
recorder only when neither Meetily nor Aqua is being used for that meeting.

Priority:

1. Meetily records meeting audio and owns meeting-note generation.
2. Aqua handles dictation or imported-audio metadata when Meetily is not used.
3. Screenpipe audio records only as fallback.

Screenpipe still records screen/UI context, stores memories, and indexes the
final compact digest. It must not intentionally duplicate Meetily/Aqua audio
for the same meeting. The connector records this as a policy signal rather than
mutating daemon audio settings because Screenpipe exposes audio devices through
CLI commands but not a safe per-meeting audio toggle through pipes.

Local Mac operationalization:
The main Screenpipe LaunchAgent runs with audio disabled. Separate local
extra-audio launch scripts must stop/skip when Meetily, Aqua Voice, or Cognitor
is running, so the single-recorder policy is enforced outside the pipe prompt
as well.

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
- Aqua lane for dictation transcript text plus metadata, excluding raw audio and
  Aqua audio file paths.
- Meetily lane for app install/status and meeting-capture readiness only.
- Meeting Capture Policy lane for single-recorder arbitration.
- Browser Privacy Policy lane for Cognitor/private-mode kill-switch handling.
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
- Publishing Aqua transcript text to the public repo or publishing raw audio.
- Publishing Meetily transcript text or raw recordings.
- Publishing calendar event text.
- Running multiple meeting recorders for the same call by default.
- Writing Context Hub memories during Cognitor/private browser mode.
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
