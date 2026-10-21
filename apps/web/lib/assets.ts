import { z } from "zod";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ASSET_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;
export const assetMimeSchema = z.enum(ASSET_MIMES);
export const uploadLengthSchema = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(MAX_UPLOAD_BYTES));

export function sanitizeFilename(encoded: string): string {
  const decoded = decodeURIComponent(encoded);
  return (
    decoded
      .replace(/\\/g, "/")
      .split("/")
      .pop()!
      // oxlint-disable-next-line no-control-regex -- Remove header/control characters from untrusted filenames.
      .replace(/[\u0000-\u001f\u007f-\u009f"<>:|?*\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 180) || "Untitled file"
  );
}
export function matchesMagic(bytes: Uint8Array, mime: string): boolean {
  const starts = (...prefix: number[]) => prefix.every((byte, i) => bytes[i] === byte);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  switch (mime) {
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/gif":
      return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    default:
      return false;
  }
}
export function markdownExcerpt(markdown: string | null | undefined): string {
  // Bound work on large notes while leaving room to strip leading formatting.
  return (markdown ?? "")
    .slice(0, 4_000)
    .replace(/```[^\n]*\n?/g, "")
    .replace(/~~~[^\n]*\n?/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\\([\\[\]{}()#+.!>-])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
export function fileDisposition(name: string, download: boolean): string {
  return `${download ? "attachment" : "inline"}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`;
}
