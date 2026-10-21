import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type { Metadata } from "./metadata.ts";

let runtime: Miniflare;
beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `import { extractMetadata, fetchMetadata } from './metadata.ts';
      export default { async fetch(request) {
        const input = await request.json();
        if (input.fetch) {
          let count = 0;
          try { await fetchMetadata('https://example.com', async () => {
            count++;
            if (input.fetch === 'private-redirect') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });
            return new Response('x'.repeat(524289), { headers: { 'content-type': 'text/html' } });
          }); return Response.json({ failed: false }); }
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
it("rejects oversized streams and private redirects before fetching a second target", async () => {
  for (const mode of ["size", "private-redirect"]) {
    const response = await runtime.dispatchFetch("https://unit.test/", {
      method: "POST",
      body: JSON.stringify({ fetch: mode }),
    });
    expect(await response.json()).toEqual({ failed: true, count: 1 });
  }
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
