export class ActivityWatchClient {
  constructor(baseUrl, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async get(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`ActivityWatch GET ${path} failed (${res.status})`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async info() {
    return this.get("/info");
  }

  async buckets() {
    return this.get("/buckets");
  }

  async events(bucketId, { start, end, limit = 1000 } = {}) {
    return this.get(`/buckets/${encodeURIComponent(bucketId)}/events`, {
      start,
      end,
      limit,
    });
  }
}

export function classifyBucket(bucketId, bucket = {}) {
  const id = String(bucketId).toLowerCase();
  const type = String(bucket.type || "").toLowerCase();
  if (id.includes("whoop") || type.includes("whoop")) return "whoop";
  if (id.includes("youtube") || type.includes("youtube")) return "youtube";
  if (id.includes("presence") || type.includes("presence")) return "presence";
  if (id.includes("window") || type.includes("currentwindow")) return "activity";
  if (id.includes("afk") || type.includes("afk")) return "afk";
  return "other";
}

export function isInterestingBucket(bucketId, bucket) {
  return ["whoop", "youtube", "presence", "activity", "afk"].includes(
    classifyBucket(bucketId, bucket),
  );
}
