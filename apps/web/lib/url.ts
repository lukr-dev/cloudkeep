export function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Use an HTTP(S) URL without credentials");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host.includes(".") ||
    host === "localhost" ||
    /\.(localhost|local|internal|test|invalid)$/.test(host) ||
    host.includes(":") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host)
  ) {
    throw new Error("Use a public DNS hostname");
  }
  url.hostname = host;
  url.hash = "";
  // Snapshot keys: deleting while iterating URLSearchParams skips adjacent entries.
  const keys = Array.from(url.searchParams.keys());
  for (const key of keys) {
    if (/^utm_/i.test(key) || ["fbclid", "gclid"].includes(key.toLowerCase()))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}
export function resolveHttpUrl(value: string | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
