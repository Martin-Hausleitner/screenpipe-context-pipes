import { execFileSync } from "node:child_process";

export function readGogStatus({ command = "gog" } = {}) {
  try {
    const raw = execFileSync(command, ["status", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    const status = JSON.parse(raw);
    return {
      ok: true,
      installed: true,
      credentialsConfigured: Boolean(status?.account?.credentials_exists),
      configExists: Boolean(status?.config?.exists),
      keyringBackend: status?.keyring?.backend || "unknown",
    };
  } catch (err) {
    return {
      ok: false,
      installed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
