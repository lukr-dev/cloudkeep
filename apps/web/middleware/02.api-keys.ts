import { defineMiddleware } from "void";
import { db, and, eq, or, gt, isNull } from "void/db";
import { apiKeys } from "../db/schema.ts";
import { userTable } from "../.void/better-auth-schema.ts";
import { API_KEY_PREFIX, apiKeyHash } from "../lib/api-keys.ts";
import { fail } from "../lib/http.ts";

export default defineMiddleware(async (c, next) => {
  if (!c.req.path.startsWith("/api/")) return next();
  const authorization = c.req.header("authorization");
  if (!authorization?.startsWith(`Bearer ${API_KEY_PREFIX}`)) return next();
  const hash = await apiKeyHash(authorization.slice(7));
  if (!hash) return fail(401, "Invalid or expired API key");
  const [result] = await db
    .select({ user: userTable })
    .from(apiKeys)
    .innerJoin(userTable, eq(apiKeys.userId, userTable.id))
    .where(
      and(
        eq(apiKeys.keyHash, hash),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, Date.now())),
      ),
    );
  if (!result) return fail(401, "Invalid or expired API key");
  if (/^\/api\/(?:api-keys|auth)(?:\/|$)/.test(c.req.path))
    return fail(403, "Sign in to manage API keys and sessions");
  c.set("user", result.user);
  return next();
});
