import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq } from "void/db";
import { apiKeys } from "../../../db/schema.ts";
import { fail, idParams } from "../../../lib/http.ts";

export const DELETE = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  const [deleted] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, params.id), eq(apiKeys.userId, requireAuth(c).id)))
    .returning({ id: apiKeys.id });
  if (!deleted) return fail(404, "API key not found");
  return { ok: true };
});
