export function resolveMeetingCapturePolicy({ meetily, aqua, screenpipeAudioAvailable = true } = {}) {
  if (meetily?.ok) {
    return {
      ok: true,
      primaryRecorder: "meetily",
      screenpipeAudioRole: screenpipeAudioAvailable ? "fallback-and-context-only" : "off",
      aquaRole: aqua?.ok ? "dictation-metadata-only" : "not-available",
      duplicateAudioRisk: "low",
      rule: "Use Meetily for meeting recording; do not start Screenpipe meeting audio for the same meeting unless Meetily is unavailable.",
    };
  }

  if (aqua?.ok) {
    return {
      ok: true,
      primaryRecorder: "aqua",
      screenpipeAudioRole: screenpipeAudioAvailable ? "fallback-only" : "off",
      aquaRole: "dictation-or-import-metadata",
      duplicateAudioRisk: "medium",
      rule: "Use Aqua for dictation/import audio; use Screenpipe audio only for meetings not captured by Aqua or Meetily.",
    };
  }

  return {
    ok: Boolean(screenpipeAudioAvailable),
    primaryRecorder: screenpipeAudioAvailable ? "screenpipe" : "none",
    screenpipeAudioRole: screenpipeAudioAvailable ? "primary-fallback" : "off",
    aquaRole: "not-available",
    duplicateAudioRisk: screenpipeAudioAvailable ? "medium" : "none",
    rule: "Use Screenpipe audio only when neither Meetily nor Aqua is available for the meeting capture path.",
  };
}
