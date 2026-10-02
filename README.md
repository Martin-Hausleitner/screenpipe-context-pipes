# screenpipe-context-pipes

Local-first Screenpipe pipes and connector scripts for turning metadata from
ActivityWatch, WHOOP imports, YouTube watch sessions, Aqua Voice exports,
Meetily meeting-capture status, Gog Calendar status, local agent skills, and
selected Screenpipe Store pipes into durable Screenpipe context. Browser private
mode and Cognitor launcher sessions are treated as a kill switch for memory
writes.

The project is intentionally conservative:

- reads ActivityWatch via the local API when available
- detects WHOOP / YouTube / presence buckets by bucket id and event shape
- summarizes Aqua Voice export metadata and local transcript text
- detects Meetily as the primary local meeting recorder when installed
- applies a single-audio-recorder policy before recommending Screenpipe audio
- detects Gog Calendar CLI readiness without event title/description text
- blocks Context Hub memory writes when Cognitor/private browser mode is seen
- inventories local agent skills without copying private skill bodies by default
- writes only compact summaries to Screenpipe memories, and only with `--write`
- defaults to `--dry-run`

## What this is

This is not a replacement for ActivityWatch or WHOOP importers. It is a bridge
that lets Screenpipe centralize high-signal metadata those tools already know:

- app/window time summaries
- WHOOP sleep, recovery, strain, workouts, cycles, and journal markers
- YouTube watch-session summaries
- Aqua Voice dictation transcript text, counts, audio duration, freshness, and model metadata
- Meetily install status and meeting-capture role
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
| Aqua Voice | linked exporter | <https://github.com/Martin-Hausleitner/aqua-voice-exporter> | local transcript text allowed; no raw audio or audio paths |
| Gog Calendar | local CLI | <https://github.com/openclaw/gogcli> | readiness only; event text stays private |
| Discord voice | linked pipeline | <https://github.com/Martin-Hausleitner/discord-voice-obsidian-agent> | local-first recording; bot mode opt-in only |
| Meetily | installed local app | <https://github.com/Zackriya-Solutions/meetily> | primary meeting recorder; no transcript text in public config |
| Cognitor/private browser | local privacy policy | `policy:private-browser-kill-switch` | block writes and drop matching browser events |
| Apple Photos local search | local skill strategy | Apple Photos local library | read-only search/OCR, no exports by default |
| CMUX manager status | local manager strategy | `cmux-agent-status.py` | summarize state, no raw terminal logs |
| Screenpipe UI | linked UI | <https://github.com/remoun/screenpipe-ui> | terminal/Web browsing over local API |
| Obsidian Vault | local private vault | `Martin` | vault contents are not published |

Public fields are limited to source categories, capability flags, redaction
policy names, Store slugs, install status, and coarse health metadata. Never
publish tokens, API keys, OAuth secrets, stable private IDs, raw audio,
raw exports, full skill bodies, calendar event text, browser history, or local
absolute paths. Aqua transcript text is a local/private connector output, not a
public manifest payload.

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

## Pipe Matrix

| Pipe / lane | Source | Writes memories | Privacy guard | Stack role |
|---|---|---:|---|---|
| Context Hub | ActivityWatch, WHOOP, YouTube, Aqua, Meetily, Gog, skills | opt-in / scheduled | blocks on Cognitor/private browser signal | central metadata bridge |
| Browser Privacy Policy | ActivityWatch current-window metadata | no | drops private browser events and sets `privacy:write-blocked` | kill switch for private browsing |
| Meeting Capture Policy | Meetily, Aqua, Screenpipe runtime status | no | single-audio-recorder arbitration | prevents duplicate meeting audio |
| Digital Clone | Screenpipe memories | yes | depends on upstream memory filters | durable user/profile memory |
| Meeting Intelligence | Screenpipe meeting/audio/screen context | yes | should not process Cognitor/private windows; Meetily owns meeting audio | meeting summaries and follow-ups |
| Obsidian Daily Summary | Screenpipe daily context | yes | consumes only filtered memories | daily note export |
| Personal CRM | Screenpipe memories and conversations | yes | consumes only filtered memories | relationship recall |
| Apple Photo Sync | Apple Photos | yes | local-only, no public exports | visual context enrichment |
| Voice Memos Sync | iCloud Voice Memos | yes | local indexed source; no public raw audio | imported voice notes |

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
| Aqua Voice | exported metadata files | Transcript text exported locally; no raw audio or audio paths |
| Meetily | `/Applications/meetily.app` | Primary meeting recorder when installed |
| Browser Privacy Policy | ActivityWatch current-window events | Blocks writes on Cognitor/private browser signal |
| Gog Calendar | `gog status --json` | No event titles/descriptions |
| Skills | `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills` | Names and first heading only |

## Meeting Capture Arbitration

Only one tool should record meeting audio for a given meeting.

| Priority | Tool | Role | Screenpipe audio behavior |
|---:|---|---|---|
| 1 | Meetily | primary meeting recorder and meeting note workspace | fallback/context-only |
| 2 | Aqua Voice | dictation or imported-audio metadata source | fallback-only |
| 3 | Screenpipe audio | fallback recorder when neither Meetily nor Aqua is active | primary fallback |

Screenpipe remains valuable for screen/UI context, memories, search, and
timeline recall. It should not also record the same meeting audio while Meetily
is actively recording that meeting. This avoids duplicate transcripts, double
storage growth, and conflicting meeting summaries.

On this Mac the main Screenpipe LaunchAgent runs with `--disable-audio`; the
separate local extra-audio LaunchAgents are guarded so they skip/stop while
Meetily, Aqua Voice, or Cognitor is running.

## Browser Private Mode Policy

Cognitor launcher sessions and browser private modes are treated as a local
privacy boundary. When an ActivityWatch current-window event indicates
`Cognitor`, `Incognito`, `InPrivate`, `Private Browsing`, `Private Window`, or
`CloakBrowser`, the connector:

1. drops matching browser events before summarization
2. sets `privacy:write-blocked`
3. skips `--write` calls to Screenpipe memories
4. reports the Screenpipe record hardening flags that should be used on daemon
   start, including `--ignored-windows ::Incognito`,
   `--ignored-windows ::Private Browsing`, `--ignored-windows ::Cognitor`,
   `--disable-clipboard-capture`, and `--disable-keyboard-capture`

This policy is deliberately conservative: any private/Cognitor signal inside
the snapshot range blocks the Context Hub memory write for that run.

## External Data Routing

Each source should be treated like a bounded subagent lane:

1. read one local source
2. normalize into a compact schema
3. drop private fields
4. summarize
5. let only the final publisher write Screenpipe memories

The current lanes are ActivityWatch, WHOOP, YouTube, Aqua Voice, Meetily,
Meeting Capture Policy, Browser Privacy Policy, Gog Calendar, local skills,
Apple Photos strategy, Discord voice strategy, and CMUX manager status strategy.
A source lane must not receive another lane's raw payload unless that is
explicitly required.

## Workflow Ideas

| Idea | Inputs | Output | Why it helps |
|---|---|---|---|
| Founder daily operating brief | Screenpipe, ActivityWatch, WHOOP, Gog, CMUX | morning Memory + Obsidian daily note | joins energy, calendar, active projects, and agent status |
| Meeting intelligence loop | Meetily, Screenpipe context, Aqua, Discord voice pipeline | meeting summary + CRM follow-up | Meetily records meeting audio once; Screenpipe adds screen/timeline context |
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
default local Whisper path. In this repo it is integrated as a local transcript
and metadata source: transcript text, word counts, recency, duration, model, and
mic profile counts are available to the connector. Raw audio and Aqua audio file
paths are not exported.

Meetily is installed as the primary meeting-capture app. If Meetily is active
for a call, Screenpipe audio should stay fallback/context-only for that call.
If Meetily is not used but Aqua is being used for dictation/import audio,
Screenpipe audio should still stay fallback-only.

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
- `meetily` / `Zackriya-Solutions/meetily`
- `discord-voice-obsidian-agent`
- `gog` / `openclaw/gogcli` for calendar automation
- `remoun/screenpipe-ui` for CLI/TUI/Web inspection of Screenpipe data

I did not find an existing public ActivityWatch/WHOOP-to-Screenpipe pipe with
the same purpose during initial research.
