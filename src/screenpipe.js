export class ScreenpipeClient {
  constructor(baseUrl, { apiKey = process.env.SCREENPIPE_API_KEY, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async health() {
    return this.request("/health");
  }

  async createMemory(payload) {
    return this.request("/memories", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = { ...(options.headers || {}) };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    try {
      const res = await this.fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Screenpipe ${path} failed (${res.status}): ${body}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
