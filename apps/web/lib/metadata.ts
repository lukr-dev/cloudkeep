import { decodeHTML, decodeHTMLAttribute } from "entities/decode";
import { normalizeUrl, resolveHttpUrl } from "./url.ts";

export const MAX_BODY_BYTES = 512 * 1024;
export const MAX_CONTENT_CHARS = 20_000;
export type Metadata = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string | null;
  contentText: string;
};
function attribute(element: { getAttribute(name: string): string | null }, name: string) {
  const value = element.getAttribute(name);
  return value === null ? null : decodeHTMLAttribute(value);
}
export async function extractMetadata(response: Response, pageUrl: string): Promise<Metadata> {
  const meta = new Map<string, string>();
  let title = "";
  let content = "";
  let icon: string | undefined;
  let base = pageUrl;
  let excludedDepth = 0;
  const excluded = new Set([
    "script",
    "style",
    "noscript",
    "nav",
    "footer",
    "header",
    "svg",
    "template",
  ]);
  const rewriter = new HTMLRewriter()
    .on("*", {
      element(element) {
        const hidden =
          excluded.has(element.tagName) ||
          element.hasAttribute("hidden") ||
          attribute(element, "aria-hidden") === "true";
        if (
          hidden &&
          ![
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
          ].includes(element.tagName)
        ) {
          excludedDepth++;
          element.onEndTag(() => {
            excludedDepth--;
          });
        }
        if (element.tagName === "meta") {
          const name = (
            attribute(element, "property") ?? attribute(element, "name")
          )?.toLowerCase();
          const value = attribute(element, "content");
          if (name && value && !meta.has(name)) meta.set(name, value.slice(0, 4_000));
        }
        if (element.tagName === "base" && base === pageUrl)
          base = resolveHttpUrl(attribute(element, "href") ?? undefined, pageUrl) ?? pageUrl;
        if (
          element.tagName === "link" &&
          !icon &&
          /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(attribute(element, "rel") ?? "")
        )
          icon = attribute(element, "href") ?? undefined;
        if (
          ["p", "div", "br", "li", "h1", "h2", "article"].includes(element.tagName) &&
          content.length < MAX_CONTENT_CHARS
        )
          content += " ";
      },
    })
    .on("title", {
      text(chunk) {
        title = (title + chunk.text).slice(0, 1_000);
      },
    })
    .on("body", {
      text(chunk) {
        if (!excludedDepth && content.length < MAX_CONTENT_CHARS)
          content += chunk.text.slice(0, MAX_CONTENT_CHARS - content.length);
      },
    });
  // Drain incrementally so neither the original nor transformed document is buffered.
  const reader = rewriter.transform(response).body?.getReader();
  if (reader)
    while (!(await reader.read()).done) {
      /* consume */
    }
  title = decodeHTML(title);
  content = decodeHTML(content);
  return {
    title:
      (meta.get("og:title") ?? meta.get("twitter:title") ?? title).trim().slice(0, 1_000) || null,
    description:
      (
        meta.get("og:description") ??
        meta.get("twitter:description") ??
        meta.get("description") ??
        ""
      )
        .trim()
        .slice(0, 4_000) || null,
    imageUrl: resolveHttpUrl(
      meta.get("og:image") ?? meta.get("twitter:image") ?? meta.get("twitter:image:src"),
      base,
    ),
    siteName: meta.get("og:site_name")?.trim().slice(0, 300) ?? null,
    faviconUrl: resolveHttpUrl(icon ?? "/favicon.ico", base),
    contentText: content.replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_CHARS),
  };
}
export async function fetchMetadata(
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<Metadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    let url = normalizeUrl(input);
    for (let redirects = 0; redirects <= 4; redirects++) {
      const response = await fetcher(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html", "User-Agent": "CloudKeep/1.0 bookmark metadata" },
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) throw new Error("Page redirect has no location");
        url = normalizeUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Page returned HTTP ${response.status}`);
      }
      if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "")) {
        await response.body?.cancel();
        throw new Error("Page is not HTML");
      }
      if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES) {
        await response.body?.cancel();
        throw new Error("Page exceeds 512 KiB");
      }
      let bytes = 0;
      const limited = response.body?.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, stream) {
            bytes += chunk.byteLength;
            if (bytes > MAX_BODY_BYTES) {
              controller.abort();
              throw new Error("Page exceeds 512 KiB");
            }
            stream.enqueue(chunk);
          },
        }),
      );
      return await extractMetadata(new Response(limited, { headers: response.headers }), url);
    }
    throw new Error("Too many page redirects");
  } finally {
    clearTimeout(timeout);
  }
}
