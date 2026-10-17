import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, eq, and } from "void/db";
import { lists } from "../../../db/schema.ts";
import { idParams, ownList } from "../../../lib/http.ts";
import { listBody } from "../../../lib/validators.ts";

export const GET = defineHandler.withValidator({ params: idParams })(async (c, { params }) => ({
  list: await ownList(requireAuth(c).id, params.id),
}));
export const PATCH = defineHandler.withValidator({ params: idParams, body: listBody })(async (
  c,
  { params, body },
) => {
  const userId = requireAuth(c).id;
  await ownList(userId, params.id);
  const [list] = await db
    .update(lists)
    .set({ name: body.name, updatedAt: Date.now() })
    .where(and(eq(lists.id, params.id), eq(lists.userId, userId)))
    .returning();
  return { list };
});
export const DELETE = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  const userId = requireAuth(c).id;
  await ownList(userId, params.id);
  await db.delete(lists).where(and(eq(lists.id, params.id), eq(lists.userId, userId)));
  return { ok: true };
});
