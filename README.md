# screenpipe-context-pipes

Local-first Screenpipe pipes and connector scripts for turning metadata from
ActivityWatch, WHOOP imports, YouTube watch sessions, Aqua Voice exports,
Gog Calendar status, local agent skills, and selected Screenpipe Store pipes
into durable Screenpipe context.

The project is intentionally conservative:

- reads ActivityWatch via the local API when available
- detects WHOOP / YouTube / presence buckets by bucket id and event shape
- summarizes Aqua Voice export metadata without transcript text
- detects Gog Calendar CLI readiness without event title/description text
- inventories local agent skills without copying private skill bodies by default
- writes only compact summaries to Screenpipe memories, and only with `--write`
- defaults to `--dry-run`

## What this is

This is not a replacement for ActivityWatch or WHOOP importers. It is a bridge
that lets Screenpipe centralize high-signal metadata those tools already know:

- app/window time summaries
- WHOOP sleep, recovery, strain, workouts, cycles, and journal markers
- YouTube watch-session summaries
- Aqua Voice dictation counts, audio duration, freshness, and model metadata
- Gog Calendar CLI readiness for future schedule-aware summaries
- local skill names and capability tags
- health/status checks for local sources

## Public Configuration

This repository publishes a redacted, derived Screenpipe configuration. It is
not a dump of the local `~/.screenpipe` folder.

| Layer | Status | Public artifact | Private data policy |
|---|---|---|---|
| Context Hub | installed local pipe | `pipes/context-hub/pipe.md` | compact summaries only |
| Public manifest | committed | `config/screenpipe.public.json` | no tokens, no paths, no raw exports |
| WHOOP | linked importer | <https://github.com/Martin-Hausleitner/aw-importer-whoop> | ActivityWatch bucket summaries only |
| YouTube | linked importer | <https://github.com/Martin-Hausleitner/aw-importer-youtube> | session summaries only, no browser history |
| Apple Screen Time | linked importer | <https://github.com/Martin-Hausleitner/aw-importer-apple-screentime> | aggregate app-time source |
| Aqua Voice | linked exporter | <https://github.com/Martin-Hausleitner/aqua-voice-exporter> | counts/freshness only, no transcript text |
| Gog Calendar | local CLI | <https://github.com/openclaw/gogcli> | readiness only; event text stays private |
| Discord voice | linked pipeline | <https://github.com/Martin-Hausleitner/discord-voice-obsidian-agent> | local-first recording; bot mode opt-in only |
| Meetily | recommended meeting layer | <https://github.com/Zackriya-Solutions/meetily> | self-hosted meeting notes next to Screenpipe/Aqua |
| Apple Photos local search | local skill strategy | Apple Photos local library | read-only search/OCR, no exports by default |
| CMUX manager status | local manager strategy | `cmux-agent-status.py` | summarize state, no raw terminal logs |
| Screenpipe UI | linked UI | <https://github.com/remoun/screenpipe-ui> | terminal/Web browsing over local API |
| Obsidian Vault | local private vault | `Martin` | vault contents are not published |

Public fields are limited to source categories, capability flags, redaction
policy names, Store slugs, install status, and coarse health metadata. Never
publish tokens, API keys, OAuth secrets, stable private IDs, raw transcripts,
raw exports, full skill bodies, calendar event text, browser history, or local
absolute paths.

## Screenpipe Store Pipes

These published pipes are part of the target local setup. The local
`screenpipe pipe install <slug>` command in the tested version printed a slug
install hint but rejected bare slugs. Installing through the local Screenpipe
server endpoint worked:

```bash
curl -X POST http://127.0.0.1:3030/pipes/store/install \
  -H 'content-type: application/json' \
  --data '{"slug":"digital-clone"}'
```

| Pipe | Slug | Purpose | Observed installs | Local status |
|---|---|---|---:|---|
| Digital Clone | `digital-clone` | Maintains memories of who you are | 15445 | installed via local API |
| Meeting Intelligence | `meeting-intel` | Meeting summaries with relationship history and screen context | 235 | installed via local API |
| Obsidian Daily Summary | `obsidian-daily-summary` | Writes daily summary in Obsidian | 853 | installed via local API, needs Obsidian connection |
| Personal CRM | `personal-crm` | Remembers people, conversations, follow-ups | 610 | installed via local API |
| Apple Photo Sync | `apple-photo-sync` | Syncs Apple Photos into Screenpipe memories | 36 | installed via local API |
| Voice Memos Sync | `voice-memos-sync` | Indexes iCloud Voice Memos into Screenpipe memories | 51 | installed via local API |

The built-in local templates already present here are `meeting-summary`,
`standup-update`, `day-recap`, `ai-habits`, `time-breakdown`, and
`video-export`.

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
| Aqua Voice | exported metadata files | No transcript text or raw audio |
| Gog Calendar | `gog status --json` | No event titles/descriptions |
| Skills | `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills` | Names and first heading only |

## External Data Routing

Each source should be treated like a bounded subagent lane:

1. read one local source
2. normalize into a compact schema
3. drop private fields
4. summarize
5. let only the final publisher write Screenpipe memories

The current lanes are ActivityWatch, WHOOP, YouTube, Aqua Voice, Gog Calendar,
local skills, Apple Photos strategy, Discord voice strategy, and CMUX manager
status strategy. A source lane must not receive another lane's raw payload
unless that is explicitly required.

## Workflow Ideas

| Idea | Inputs | Output | Why it helps |
|---|---|---|---|
| Founder daily operating brief | Screenpipe, ActivityWatch, WHOOP, Gog, CMUX | morning Memory + Obsidian daily note | joins energy, calendar, active projects, and agent status |
| Meeting intelligence loop | Screenpipe audio, Meetily, Aqua, Discord voice pipeline | meeting summary + CRM follow-up | separates live meeting capture from dictation and Discord calls |
| Health-aware work blocks | WHOOP, ActivityWatch, Gog | suggested focus/recovery blocks | uses recovery/sleep against real work patterns |
| Media learning recall | YouTube importer, Screenpipe, Obsidian | watched-topic memory digest | turns passive watching into searchable context |
| Photos context memory | Apple Photo Sync, local Photos search skill | privacy-safe photo/event memories | adds visual life context without committing photo exports |
| Agent manager recap | CMUX status, Screenpipe UI, Context Hub | agent fleet daily summary | shows which agents did useful work and where they stalled |

## Discord And Voice

Default mode is local recording on the user's machine: capture mic/system audio
locally, transcribe locally where possible, and write summaries only. A bot on
vcvm is a fallback for headless/managed cases and needs explicit opt-in,
server/channel allowlists, authenticated transport, transcript-first output,
and no raw audio retention unless enabled.

Aqua Voice is useful when its dictation quality is better than Screenpipe's
default local Whisper path. In this repo it is integrated as a metadata source:
word counts, recency, duration, model, and mic profile counts. Transcript text
stays private.

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
- `aqua-voice-exporter`
- `discord-voice-obsidian-agent`
- `gog` / `openclaw/gogcli` for calendar automation
- `remoun/screenpipe-ui` for CLI/TUI/Web inspection of Screenpipe data

I did not find an existing public ActivityWatch/WHOOP-to-Screenpipe pipe with
the same purpose during initial research.
