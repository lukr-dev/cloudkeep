import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq, isNull, sql } from "void/db";
import { z } from "zod";
import { prompts } from "../../../../db/schema.ts";
import { promptKind } from "../../../../lib/prompts.ts";
import { effectivePrompts } from "../../../../lib/settings.ts";

const params = z.object({ kind: promptKind });
export const PUT = defineHandler.withValidator({
  params,
  body: z.object({ template: z.string().trim().min(1).max(12_000) }).strict(),
})(async (c, { params, body }) => {
  const userId = requireAuth(c).id;
  await db
    .insert(prompts)
    .values({
      id: crypto.randomUUID(),
      userId,
      listId: null,
      kind: params.kind,
      template: body.template,
    })
    .onConflictDoUpdate({
      target: [prompts.userId, prompts.kind],
      targetWhere: sql`${prompts.listId} is null`,
      set: { template: body.template },
    });
  return (await effectivePrompts(userId))[params.kind];
});
export const DELETE = defineHandler.withValidator({ params })(async (c, { params }) => {
  const userId = requireAuth(c).id;
  await db
    .delete(prompts)
    .where(and(eq(prompts.userId, userId), eq(prompts.kind, params.kind), isNull(prompts.listId)));
  return (await effectivePrompts(userId))[params.kind];
});
