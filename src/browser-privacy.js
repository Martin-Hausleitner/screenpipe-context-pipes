export const DEFAULT_BROWSER_PRIVACY_POLICY = {
  mode: "private-browser-kill-switch",
  memoryWritesWhenPrivate: "blocked",
  privateEventHandling: "drop-private-browser-events",
  launcherNames: ["cognitor"],
  browserApps: [
    "Arc",
    "Brave Browser",
    "Chromium",
    "Comet",
    "Firefox",
    "Google Chrome",
    "Microsoft Edge",
    "Opera",
    "Safari",
    "Vivaldi",
    "Zen",
  ],
  privateWindowPatterns: [
    "incognito",
    "inprivate",
    "private browsing",
    "private window",
    "privates fenster",
    "cognitor",
    "cloakbrowser",
  ],
  screenpipeRecordFlags: [
    "--ignored-windows ::Incognito",
    "--ignored-windows ::InPrivate",
    "--ignored-windows ::Private Browsing",
    "--ignored-windows ::Private Window",
    "--ignored-windows ::Cognitor",
    "--ignored-windows CloakBrowser::",
    "--disable-clipboard-capture",
    "--disable-keyboard-capture",
  ],
};

export function resolveBrowserPrivacyPolicy({
  events = [],
  policy = DEFAULT_BROWSER_PRIVACY_POLICY,
} = {}) {
  const matches = events.filter((event) => isPrivateBrowserEvent(event, policy));
  const latest = latestEvent(matches);
  const active = matches.length > 0;
  return {
    ok: true,
    mode: policy.mode,
    active,
    shouldWriteMemory: !active,
    writeAction: active ? "block-memory-write" : "allow-memory-write",
    privateEventHandling: policy.privateEventHandling,
    matchedEventCount: matches.length,
    latestPrivateEventTimestamp: latest?.timestamp || null,
    launchers: [...policy.launcherNames],
    screenpipeRecordFlags: [...policy.screenpipeRecordFlags],
    rule: active
      ? "Private/Cognitor browser mode was detected in the snapshot range; do not save Screenpipe memories and drop matching browser events."
      : "No private/Cognitor browser event was detected; normal redacted summaries may be written.",
  };
}

export function filterPrivateBrowserEvents(events = [], policy = DEFAULT_BROWSER_PRIVACY_POLICY) {
  return events.filter((event) => !isPrivateBrowserEvent(event, policy));
}

export function isPrivateBrowserEvent(event, policy = DEFAULT_BROWSER_PRIVACY_POLICY) {
  const haystack = searchableText(event);
  if (!haystack) return false;

  const app = String(event?.data?.app || event?.app_name || "").toLowerCase();
  const browserMatch = policy.browserApps.some((name) => app.includes(name.toLowerCase()));
  const launcherMatch = policy.launcherNames.some((name) => haystack.includes(name.toLowerCase()));
  const privateMatch = policy.privateWindowPatterns.some((pattern) =>
    haystack.includes(pattern.toLowerCase()),
  );

  return launcherMatch || (browserMatch && privateMatch);
}

function searchableText(event) {
  const data = event?.data || {};
  return [
    event?.app_name,
    event?.window_name,
    data.app,
    data.title,
    data.name,
    data.url,
    data.browser_url,
    data.window,
    data.window_title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function latestEvent(events) {
  return [...events].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
}
