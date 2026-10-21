import { expect, it } from "vite-plus/test";
import { bookmarkTitle, domain, relativeAge, sourceName } from "./presentation.ts";
import { iconSvg } from "./icons.ts";
it("extracts a display domain without the URL global", () => {
  expect(domain("https://www.example.com:8443/path?q=x")).toBe("example.com");
  expect(domain("http://example.org")).toBe("example.org");
  expect(domain("https://[::1]:8080/path")).toBe("[::1]");
  expect(domain("https://user@example.com/page")).toBe("example.com");
  expect(domain("invalid")).toBe("invalid");
});
it("labels notes and files that have no URL", () => {
  const base = { url: null, title: null, assetName: null, assetType: null } as const;
  expect(sourceName({ ...base, type: "text" })).toBe("Note");
  expect(sourceName({ ...base, type: "asset", assetType: "pdf" })).toBe("PDF");
  expect(sourceName({ ...base, type: "asset", assetType: "image" })).toBe("Image");
  expect(sourceName({ ...base, type: "link", url: "https://www.example.com/a" })).toBe(
    "example.com",
  );
  expect(bookmarkTitle({ ...base, type: "text" })).toBe("Untitled note");
  expect(bookmarkTitle({ ...base, type: "asset", assetName: "scan.pdf" })).toBe("scan.pdf");
  expect(bookmarkTitle({ ...base, type: "link", url: "https://example.com" })).toBe(
    "https://example.com",
  );
});
it("formats relative bookmark ages at unit boundaries", () => {
  const now = 1_800_000_000_000;
  expect(relativeAge(now, now)).toBe("just now");
  expect(relativeAge(now + 1000, now)).toBe("just now");
  expect(relativeAge(now - 60_000, now)).toBe("1m");
  expect(relativeAge(now - 7_200_000, now)).toBe("2h");
  expect(relativeAge(now - 172_800_000, now)).toBe("2d");
  expect(relativeAge(now - 604_800_000, now)).toBe("1w");
  expect(relativeAge(now - 2_592_000_000, now)).toBe("1mo");
  expect(relativeAge(now - 31_536_000_000, now)).toBe("1y");
});
it("embeds icon paths and the resolved stroke color in an SVG string", () => {
  expect(iconSvg("check", "#6cc4a0")).toContain('stroke="#6cc4a0"');
  expect(iconSvg("check", "#6cc4a0")).toContain('<path d="m5 12 4 4L19 6"/>');
  expect(iconSvg("bookmark", "#18181b")).toContain('viewBox="0 0 24 24"');
});
