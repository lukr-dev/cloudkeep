import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { MAX_BODY_BYTES, type Metadata } from "./metadata.ts";

let runtime: Miniflare;
beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `import { extractMetadata, fetchMetadata, MAX_BODY_BYTES } from './metadata.ts';
      export default { async fetch(request) {
        const input = await request.json();
        if (input.fetch) {
          let count = 0;
          let cancelled = false;
          let offset = 0;
          const prefix = '<head><meta property="og:title" content="Large title"><meta property="og:description" content="Large description"><link rel="icon" href="/large.ico"></head><body><p>Readable beginning</p><script>';
          const html = input.fetch === 'text-full'
            ? '<body>' + 'a'.repeat(25000) + '</body><meta property="og:title" content="Late title">'
            : input.fetch === 'small' || input.fetch === 'declared'
            ? '<body>Small page</body>'
            : input.fetch === 'exact'
              ? prefix.padEnd(MAX_BODY_BYTES, 'x')
              : prefix.padEnd(MAX_BODY_BYTES - 50, 'x') + '</script><p>' + 'B'.repeat(100) + 'x'.repeat(MAX_BODY_BYTES);
          const data = new TextEncoder().encode(html);
          try { const metadata = await fetchMetadata('https://example.com', async () => {
            count++;
            if (input.fetch === 'private-redirect') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });
            const body = new ReadableStream({
              pull(stream) {
                if (offset >= data.length) { stream.close(); return; }
                const end = Math.min(offset + 65539, data.length);
                stream.enqueue(data.subarray(offset, end));
                offset = end;
              },
              cancel() { cancelled = true; },
            }, { highWaterMark: 0 });
            return new Response(body, { headers: {
              'content-type': 'text/html',
              ...(input.fetch === 'declared' ? { 'content-length': String(MAX_BODY_BYTES * 2) } : {}),
            } });
          });
          // Let pipe cancellation settle before reporting the upstream state.
          await new Promise(resolve => setTimeout(resolve, 0));
          return Response.json({ metadata, cancelled, downloaded: offset, failed: false }); }
          catch { return Response.json({ failed: true, count }); }
        }
        return Response.json(await extractMetadata(new Response(input.html), 'https://example.com/posts/one'));
      }};`,
      resolveDir: dirname(fileURLToPath(import.meta.url)),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  runtime = new Miniflare({
    workers: [
      {
        config: {
          name: "metadata-test",
          compatibilityDate: "2026-10-12",
          manifest: {
            mainModule: "index.js",
            modules: { "index.js": { type: "esm", contents: bundle.outputFiles[0]!.text } },
          },
        },
      },
    ],
  });
});
afterAll(async () => {
  await runtime?.dispose();
});
async function extract(html: string): Promise<Metadata> {
  const response = await runtime.dispatchFetch("https://unit.test/", {
    method: "POST",
    body: JSON.stringify({ html }),
  });
  return response.json() as Promise<Metadata>;
}
it("uses OpenGraph ahead of Twitter/title and resolves relative assets", async () => {
  const result = await extract(
    `<html><head><title>Fallback</title><meta property="og:title" content="OG title"><meta name="twitter:title" content="Twitter"><meta property="og:description" content="OG description"><meta name="description" content="fallback"><meta property="og:image" content="../image.jpg"><meta property="og:site_name" content="Example"><link rel="shortcut icon" href="/icon.png"></head><body><nav>menu</nav><article><h1>Hello</h1><p>Readable <b>page</b>.</p><script>bad instructions()</script><style>bad css</style></article><footer>footer text</footer></body></html>`,
  );
  expect(result).toEqual({
    title: "OG title",
    description: "OG description",
    imageUrl: "https://example.com/image.jpg",
    faviconUrl: "https://example.com/icon.png",
    siteName: "Example",
    contentText: "Hello\n\nReadable page.",
    contentTruncated: false,
    pageTruncated: false,
  });
});
it("supports Twitter and ordinary HTML fallbacks and caps text", async () => {
  const twitter = await extract(
    '<meta name="twitter:title" content="Tweet"><meta name="twitter:description" content="Description"><meta name="twitter:image" content="/card.png"><body>hello</body>',
  );
  expect(twitter.title).toBe("Tweet");
  expect(twitter.imageUrl).toBe("https://example.com/card.png");
  const result = await extract(
    `<title>Plain title</title><meta name="description" content="Plain description"><body>${"A".repeat(25_000)}</body>`,
  );
  expect(result.title).toBe("Plain title");
  expect(result.description).toBe("Plain description");
  expect(result.contentText).toHaveLength(20_000);
  expect(result.contentTruncated).toBe(true);
  expect(result.faviconUrl).toBe("https://example.com/favicon.ico");
});
async function fetchPage(mode: string) {
  const response = await runtime.dispatchFetch("https://unit.test/", {
    method: "POST",
    body: JSON.stringify({ fetch: mode }),
  });
  return response.json() as Promise<{
    metadata: Metadata;
    cancelled: boolean;
    downloaded: number;
    failed: boolean;
    count?: number;
  }>;
}
it("truncates oversized streams, preserves partial metadata and cancels the download", async () => {
  const result = await fetchPage("large");
  expect(result.failed).toBe(false);
  expect(result.metadata).toMatchObject({
    title: "Large title",
    description: "Large description",
    faviconUrl: "https://example.com/large.ico",
    contentText: "Readable beginning\n\n" + "B".repeat(38),
    contentTruncated: false,
    pageTruncated: true,
  });
  expect(result.cancelled).toBe(true);
  expect(result.downloaded).toBeLessThan(MAX_BODY_BYTES + 65539);
});
it("accepts large declared Content-Length and marks small pages as complete", async () => {
  for (const mode of ["declared", "small", "exact"]) {
    const result = await fetchPage(mode);
    expect(result.failed).toBe(false);
    expect(result.metadata.pageTruncated).toBe(false);
    if (mode !== "exact") expect(result.metadata.contentText).toBe("Small page");
  }
});
it("continues reading after the head and text limit", async () => {
  const { metadata } = await fetchPage("text-full");
  expect(metadata.title).toBe("Late title");
  expect(metadata.contentText).toHaveLength(20_000);
  expect(metadata.contentTruncated).toBe(true);
  expect(metadata.pageTruncated).toBe(false);
});
it("rejects private redirects before fetching a second target", async () => {
  expect(await fetchPage("private-redirect")).toEqual({ failed: true, count: 1 });
});
it("decodes entities and handles hidden void elements without hiding the rest of the page", async () => {
  const result = await extract(
    "<title>Tom &amp; Jerry</title><body><input hidden><p>A &amp; B &#169; &#x1F600;</p><div hidden>secret</div><p>Visible</p></body>",
  );
  expect(result.title).toBe("Tom & Jerry");
  expect(result.contentText).toBe("A & B © 😀\n\nVisible");
});
it("decodes raw attribute values exactly once", async () => {
  const result = await extract(
    '<meta property="og:title" content="A &amp;amp; B"><meta name="description" content="A &amp; B"><meta property="og:image" content="/x?a=1&amp;b=2"><body>body</body>',
  );
  expect(result.title).toBe("A &amp; B");
  expect(result.description).toBe("A & B");
  expect(result.imageUrl).toBe("https://example.com/x?a=1&b=2");
});

it("preserves paragraph boundaries at both ends of blocks and collapses source whitespace", async () => {
  const result = await extract(
    "<body><article><p>One   <em>inline</em> sentence.</p>Between<div>Second\n line.</div><p>Third<br>Fourth</p><aside hidden><p>Hidden</p></aside></article></body>",
  );
  expect(result.contentText).toBe(
    "One inline sentence.\n\nBetween\n\nSecond line.\n\nThird\n\nFourth",
  );
  expect(result.contentTruncated).toBe(false);
});
