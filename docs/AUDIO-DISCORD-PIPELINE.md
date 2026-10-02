# Audio and Discord Pipeline

Local repair command:

```bash
python3 bin/screenpipe-audio-backfill.py --limit 8 --since-minutes 10 --newest-first
```

What it does:

- reads pending chunks from `~/.screenpipe-audio-system/db.sqlite`
- sends local audio files to `http://127.0.0.1:8767/v1/audio/transcriptions`
- writes transcript text back into `audio_transcriptions`
- marks chunks as `transcribed` or `silent`
- emits proof JSON in `.proof/` without transcript or OCR text
- infers source app from nearby frames in `~/.screenpipe/db.sqlite`
- prefers Discord frames inside the source window for Discord voice attribution

What works now:

| Check | Result |
|---|---|
| System Audio capture | Screenpipe writes 5-second `System Audio (output)` chunks |
| Local STT | Parakeet endpoint transcribes pending chunks |
| Screenpipe search | Audio search returns fresh transcribed rows |
| Discord source | Nearby Discord frames are attributed as `source_app=Discord` |
| Speaker name | Not available from System Audio alone |

Speaker identity needs one of these sources:

| Source | Why |
|---|---|
| Working Screenpipe diarization | Maps voice segments to local speaker IDs |
| Discord voice events | Gives participant identity around the audio timestamp |
| Per-speaker Discord bot capture | Records one audio stream per participant |
| Craig-style reference capture | Useful baseline for Discord per-user recording |

Known current blocker:

Screenpipe's local speaker/segmentation path is panicking in ONNX Runtime with
`ort session init` / `Mutex poisoned`. While that is broken, System Audio can be
transcribed, and Discord can be inferred as the source app, but the exact Discord
speaker cannot be proven from Screenpipe System Audio alone.
