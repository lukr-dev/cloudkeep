import { defineMiddleware } from "void";
import type { betterAuth } from "better-auth";
import type configureAuth from "../auth.ts";
import { fail } from "../lib/http.ts";

type Auth = ReturnType<typeof betterAuth<ReturnType<typeof configureAuth>>>;

export default defineMiddleware(async (c, next) => {
  if (!c.req.path.startsWith("/api/")) return next();
  const authorization = c.req.header("authorization");
  const key =
    c.req.header("x-api-key") ??
    (authorization?.startsWith("Bearer ck_") ? authorization.slice(7) : undefined);
  if (key === undefined) return next();
  if (/^\/api\/auth(?:\/|$)/.test(c.req.path))
    return fail(403, "Sign in to manage API keys and sessions");
  if (!key) return fail(401, "Invalid or expired API key");
  // Reuse Void's per-request Better Auth instance; the plugin owns verification and limits.
  const auth = c.get("__voidAuth") as Auth;
  const result = await auth.api.verifyApiKey({ body: { key } });
  if (!result.valid || !result.key) {
    if (result.error?.code === "RATE_LIMITED")
      return c.json({ error: "API key rate limit exceeded" }, 429);
    return fail(401, "Invalid or expired API key");
  }
  const user = await (await auth.$context).internalAdapter.findUserById(result.key.referenceId);
  if (!user) return fail(401, "API key account no longer exists");
  c.set("user", user);
  return next();
});
