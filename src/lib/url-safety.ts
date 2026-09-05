const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
  "instance-data",
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".corp",
  ".lan",
  ".home",
  ".invalid",
];

const MAX_RESPONSE_BYTES = 500_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; error: string };

export function isIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

export function isIPv6(host: string): boolean {
  return host.includes(":") && /^[0-9a-f:]+$/i.test(host);
}

export function parsePublicHttpUrl(raw: string): UrlCheck {
  if (!raw || typeof raw !== "string") {
    return { ok: false, error: "URL is required" };
  }
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "URLs with credentials are not allowed" };
  }
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "").replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, error: "Host is required" };
  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, error: "This host is not allowed" };
  }
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: "This host is not allowed" };
  }
  if (host === "169.254.169.254" || host.endsWith(".nip.io") || host.endsWith(".sslip.io")) {
    return { ok: false, error: "This host is not allowed" };
  }
  if ((isIPv4(host) || isIPv6(host)) && isBlockedIp(host)) {
    return { ok: false, error: "Private or reserved IP addresses are not allowed" };
  }
  return { ok: true, url: parsed };
}

export function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedV4(ip);
  if (isIPv6(ip)) return isBlockedV6(ip);
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedV4(mapped[1]);
  return true;
}

function isBlockedV4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true;
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("ff")) return true;
  if (lower.startsWith("2001:db8:")) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedV4(mapped[1]);
  return false;
}

export async function resolveAndValidateHost(hostname: string): Promise<UrlCheck> {
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isBlockedIp(hostname)) {
      return { ok: false, error: "Private or reserved IP addresses are not allowed" };
    }
    return { ok: true, url: new URL(`https://${hostname}`) };
  }
  try {
    const { lookup } = await import("node:dns/promises");
    const result = await lookup(hostname, { all: true });
    if (!result.length) {
      return { ok: false, error: "Could not resolve host" };
    }
    for (const record of result) {
      if (isBlockedIp(record.address)) {
        return { ok: false, error: "Host resolves to a private or reserved address" };
      }
    }
    return { ok: true, url: new URL(`https://${hostname}`) };
  } catch {
    return { ok: false, error: "Could not resolve host" };
  }
}

export type FetchPublicResult =
  | { ok: true; url: string; html: string; status: number }
  | { ok: false; error: string };

/**
 * Fetch a public website with SSRF guards: scheme check, host denylist,
 * DNS re-check, no credentialed URLs, redirect re-validation, timeout, size cap.
 */
export async function fetchPublicHtml(rawUrl: string): Promise<FetchPublicResult> {
  const first = parsePublicHttpUrl(rawUrl);
  if (!first.ok) return first;

  let current = first.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const resolved = await resolveAndValidateHost(current.hostname);
    if (!resolved.ok) return resolved;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "AILeadHunterBot/1.0 (+https://example.invalid; public audit)",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { ok: false, error: "Redirect without location" };
        const next = parsePublicHttpUrl(new URL(location, current).toString());
        if (!next.ok) return next;
        current = next.url;
        continue;
      }

      if (!res.ok) {
        return { ok: false, error: `Website returned HTTP ${res.status}` };
      }

      const length = Number(res.headers.get("content-length") || "0");
      if (length > MAX_RESPONSE_BYTES) {
        return { ok: false, error: "Response too large" };
      }

      const buf = await readLimited(res, MAX_RESPONSE_BYTES);
      if (!buf.ok) return buf;
      return { ok: true, url: current.toString(), html: buf.text, status: res.status };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return { ok: false, error: "Request timed out" };
      return { ok: false, error: "Network failure fetching website" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: "Too many redirects" };
}

async function readLimited(
  res: Response,
  max: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    if (text.length > max) return { ok: false, error: "Response too large" };
    return { ok: true, text };
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > max) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return { ok: false, error: "Response too large" };
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder("utf-8", { fatal: false }).decode(merged) };
}
