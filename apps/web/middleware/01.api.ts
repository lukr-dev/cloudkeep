import { defineMiddleware } from "void";
import { HTTPException } from "hono/http-exception";

export default defineMiddleware(async (c, next) => {
  if (!c.req.path.startsWith("/api/")) return next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  // Bound JSON parsing before validators or Better Auth read the body.
  if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (
      origin &&
      origin !== new URL(c.req.url).origin &&
      !c.req.header("authorization")?.startsWith("Bearer ")
    )
      return c.json({ error: "Untrusted origin" }, 403);
    const upload = c.req.method === "POST" && c.req.path === "/api/bookmarks/files";
    const maxBytes = /^\/api\/bookmarks(?:\/[^/]+)?$/.test(c.req.path) ? 640 * 1024 : 64 * 1024;
    let bytes = 0;
    const reader = upload ? undefined : c.req.raw.clone().body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          void reader.cancel();
          return c.json({ error: `Request exceeds ${maxBytes / 1024} KiB` }, 413);
        }
      }
    }
  }
  try {
    await next();
  } catch (error) {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    throw error;
  }
  // Hono catches exceptions inside downstream dispatch; normalize those too.
  if (c.error instanceof HTTPException) c.res = c.json({ error: c.error.message }, c.error.status);
  else if (c.res.status >= 500) c.res = c.json({ error: "Internal server error" }, 500);
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
});
