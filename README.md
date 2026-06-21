# screenpipe-context-pipes

Local-first Screenpipe pipes and connector scripts for turning metadata from
ActivityWatch, WHOOP imports, YouTube watch sessions, and local agent skills
into durable Screenpipe context.

The project is intentionally conservative:

- reads ActivityWatch via the local API when available
- detects WHOOP / YouTube / presence buckets by bucket id and event shape
- inventories local agent skills without copying private skill bodies by default
- writes only compact summaries to Screenpipe memories, and only with `--write`
- defaults to `--dry-run`

## What this is

This is not a replacement for ActivityWatch or WHOOP importers. It is a bridge
that lets Screenpipe centralize high-signal metadata those tools already know:

- app/window time summaries
- WHOOP sleep, recovery, strain, workouts, cycles, and journal markers
- YouTube watch-session summaries
- local skill names and capability tags
- health/status checks for local sources

## Quick Start

```bash
git clone https://github.com/Martin-Hausleitner/screenpipe-context-pipes.git
cd screenpipe-context-pipes
npm test
node bin/screenpipe-context.js doctor
node bin/screenpipe-context.js snapshot --dry-run
```

To write the generated digest into Screenpipe memories:

```bash
SCREENPIPE_API_KEY="$(screenpipe auth token)" \
node bin/screenpipe-context.js snapshot --write
```

If Screenpipe is not listening on `localhost:3030`, the command still prints the
digest and exits without writing.

## Install the Pipe

Copy or install the pipe folder:

```bash
screenpipe pipe install ./pipes/context-hub
screenpipe pipe enable context-hub
```

The pipe prompt asks the Screenpipe agent to call this connector, review the
latest local metadata snapshot, and save a concise memory.

## Commands

```bash
screenpipe-context doctor
screenpipe-context snapshot --dry-run
screenpipe-context snapshot --write
screenpipe-context snapshot --days 7 --format json
screenpipe-context skills --roots ~/.codex/skills,~/.claude/skills
```

## Data Sources

| Source | Default | Notes |
|---|---:|---|
| ActivityWatch API | `http://127.0.0.1:5600/api/0` | Buckets and events only |
| Screenpipe API | `http://127.0.0.1:3030` | Memories write target |
| WHOOP | ActivityWatch buckets `aw-importer-whoop-*` | No direct WHOOP OAuth |
| YouTube | ActivityWatch buckets containing `youtube` | No browser-history reads |
| Skills | `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills` | Names and first heading only |

## Privacy

Do not commit local exports, logs, ActivityWatch databases, WHOOP ZIP files,
OAuth tokens, browser history, or generated snapshots containing private data.

The connector only publishes code and schemas. It does not include personal
metadata.

## Prior Art

Local work this project generalizes:

- `aw-importer-whoop`
- `activitywatch-youtube-sync`
- ActivityWatch app classifier / presence status exports
- OpenClaw skills such as `openclaw-activity-watch` and
  `openclaw-whoop-activitywatch-import`

I did not find an existing public ActivityWatch/WHOOP-to-Screenpipe pipe with
the same purpose during initial research.
