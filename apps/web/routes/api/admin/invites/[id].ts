import { defineHandler } from "void";
import { db, eq } from "void/db";
import { invites } from "../../../../db/schema.ts";
import { fail, idParams, requireAdmin } from "../../../../lib/http.ts";

export const DELETE = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  await requireAdmin(c);
  const [invite] = await db
    .update(invites)
    .set({ revokedAt: Date.now() })
    .where(eq(invites.id, params.id))
    .returning({ id: invites.id });
  if (!invite) return fail(404, "Invite not found");
  return { ok: true };
});
