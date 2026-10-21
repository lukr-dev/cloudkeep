import { withRuntimeEnv } from "void/_env";
import { storage } from "void/storage";
import { expect, it } from "vite-plus/test";
import {
  filesEnabled,
  assetMimeSchema,
  uploadLengthSchema,
  MAX_UPLOAD_BYTES,
  sanitizeFilename,
  matchesMagic,
  markdownExcerpt,
  fileDisposition,
} from "./assets.ts";

it("allows only supported MIME types and positive bounded upload lengths", () => {
  for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"])
    expect(assetMimeSchema.safeParse(mime).success).toBe(true);
  for (const mime of [
    "image/svg+xml",
    "text/html",
    "application/octet-stream",
    "image/png; charset=utf-8",
  ])
    expect(assetMimeSchema.safeParse(mime).success).toBe(false);
  expect(uploadLengthSchema.parse(String(MAX_UPLOAD_BYTES))).toBe(MAX_UPLOAD_BYTES);
  for (const value of ["0", "-1", "1.5", "", "Infinity", "1e3", String(MAX_UPLOAD_BYTES + 1)])
    expect(uploadLengthSchema.safeParse(value).success).toBe(false);
});
it("matches every allowed magic signature and rejects truncated, mismatched or active content", () => {
  const fixtures = [
    ["image/png", [137, 80, 78, 71, 13, 10, 26, 10]],
    ["image/jpeg", [255, 216, 255]],
    ["image/gif", [...new TextEncoder().encode("GIF89a")]],
    ["image/webp", [...new TextEncoder().encode("RIFF1234WEBP")]],
    ["application/pdf", [...new TextEncoder().encode("%PDF-1.7")]],
  ] as const;
  for (const [mime, data] of fixtures) {
    expect(matchesMagic(new Uint8Array(data), mime)).toBe(true);
    expect(matchesMagic(new Uint8Array(data.slice(0, 2)), mime)).toBe(false);
    expect(matchesMagic(new TextEncoder().encode("<svg onload=alert(1)>"), mime)).toBe(false);
    for (const [other] of fixtures)
      if (other !== mime) expect(matchesMagic(new Uint8Array(data), other)).toBe(false);
  }
});
it("decodes and sanitizes filenames and safely encodes download headers", () => {
  expect(sanitizeFilename(encodeURIComponent('C:\\fakepath\\../résumé"\r\n.pdf'))).toBe(
    "résumé.pdf",
  );
  expect(sanitizeFilename(encodeURIComponent("../../.hidden.png"))).toBe("hidden.png");
  expect(sanitizeFilename("%00%0D%0A")).toBe("Untitled file");
  expect(sanitizeFilename("a".repeat(500))).toHaveLength(180);
  expect(() => sanitizeFilename("%oops")).toThrow();
  const unicodeName = sanitizeFilename(encodeURIComponent("a" + "😀".repeat(180)));
  expect(() => fileDisposition(unicodeName, true)).not.toThrow();
  const disposition = fileDisposition('résumé"\r\n.pdf', true);
  expect(disposition).toContain("attachment;");
  expect(disposition).not.toMatch(/[\r\n]/);
  expect(disposition).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9");
});
it("strips common Markdown and HTML syntax and bounds excerpts", () => {
  expect(
    markdownExcerpt(
      "# Heading\n\n**bold** and _italic_ [link](https://example.com)\n> quote\n- item\n1. first\n`code`\n```js\nhello()\n```",
    ),
  ).toBe("Heading bold and italic link quote item first code hello()");
  expect(markdownExcerpt("<b>hello</b> ![photo](image.png)")).toBe("hello photo");
  expect(markdownExcerpt(null)).toBe("");
  expect(markdownExcerpt("a".repeat(100_000))).toHaveLength(300);
});

it("detects the actual storage binding and never throws when Void has no binding", () => {
  expect(withRuntimeEnv({}, filesEnabled)).toBe(false);
  expect(() => withRuntimeEnv({}, () => typeof storage.put)).toThrow(
    "env: Missing Cloudflare binding 'STORAGE'.",
  );
  expect(withRuntimeEnv({ STORAGE: { put: () => {} } }, filesEnabled)).toBe(true);
  expect(withRuntimeEnv({ STORAGE: null }, filesEnabled)).toBe(false);
});
