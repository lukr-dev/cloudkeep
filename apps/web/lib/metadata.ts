import { decodeHTML, decodeHTMLAttribute } from "entities/decode";
import { normalizeUrl, resolveHttpUrl } from "./url.ts";

export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_CONTENT_CHARS = 20_000;
export type Metadata = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string | null;
  contentText: string;
  contentTruncated: boolean;
  pageTruncated: boolean;
};
function attribute(element: { getAttribute(name: string): string | null }, name: string) {
  const value = element.getAttribute(name);
  return value === null ? null : decodeHTMLAttribute(value);
}
export async function extractMetadata(response: Response, pageUrl: string): Promise<Metadata> {
  const meta = new Map<string, string>();
  let title = "";
  let content = "";
  let truncated = false;
  const append = (text: string) => {
    if (content.length + text.length > MAX_CONTENT_CHARS) truncated = true;
    content = (content + text).slice(0, MAX_CONTENT_CHARS);
  };
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
          !excludedDepth &&
          [
            "p",
            "div",
            "br",
            "li",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "article",
            "section",
            "blockquote",
            "pre",
            "tr",
            "hr",
          ].includes(element.tagName)
        ) {
          append("\u2029");
          if (!["br", "hr"].includes(element.tagName))
            element.onEndTag(() => {
              if (!excludedDepth) append("\u2029");
            });
        }
      },
    })
    .on("title", {
      text(chunk) {
        title = (title + chunk.text).slice(0, 1_000);
      },
    })
    .on("body", {
      text(chunk) {
        if (!excludedDepth) append(chunk.text.replace(/\s+/g, " "));
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
    contentText: content
      .split("\u2029")
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_CONTENT_CHARS),
    contentTruncated: truncated,
    pageTruncated: false,
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
      let bytes = 0;
      let pageTruncated = false;
      const limited = response.body?.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, stream) {
            const remaining = MAX_BODY_BYTES - bytes;
            if (chunk.byteLength > remaining) {
              pageTruncated = true;
              stream.enqueue(chunk.subarray(0, remaining));
              // Finish the partial document and cancel the upstream download.
              stream.terminate();
              return;
            }
            bytes += chunk.byteLength;
            stream.enqueue(chunk);
          },
        }),
      );
      const metadata = await extractMetadata(
        new Response(limited, { headers: response.headers }),
        url,
      );
      return { ...metadata, pageTruncated };
    }
    throw new Error("Too many page redirects");
  } finally {
    clearTimeout(timeout);
  }
}
