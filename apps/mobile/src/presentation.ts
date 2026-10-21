import type { BookmarkItem } from "./api.ts";
type Labelled = Pick<BookmarkItem, "type" | "url" | "title" | "assetName" | "assetType">;
// Lynx does not guarantee URL or Intl.RelativeTimeFormat globals.
export function domain(url: string): string {
  const host = /^https?:\/\/([^/?#]+)/i.exec(url.trim())?.[1];
  return host
    ? host
        .replace(/^.*@/, "")
        .replace(/^www\./i, "")
        .replace(/:\d+$/, "")
    : url;
}
// Notes and files have no URL; label them like the web app does.
export function sourceName(bookmark: Labelled): string {
  if (bookmark.url) return domain(bookmark.url);
  if (bookmark.type === "text") return "Note";
  return bookmark.assetType === "pdf" ? "PDF" : "Image";
}
export function bookmarkTitle(bookmark: Labelled): string {
  return bookmark.title || bookmark.assetName || bookmark.url || "Untitled note";
}
export function relativeAge(createdAt: number, now = Date.now()): string {
  const seconds = Math.max(0, (now - createdAt) / 1000);
  for (const [label, size] of [
    ["y", 31536000],
    ["mo", 2592000],
    ["w", 604800],
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
  ] as const) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label}`;
  }
  return "just now";
}
