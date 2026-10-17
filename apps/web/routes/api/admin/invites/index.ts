import { defineHandler } from "void";
import { db, desc } from "void/db";
import { z } from "zod";
import { invites } from "../../../../db/schema.ts";
import { requireAdmin } from "../../../../lib/http.ts";
import { digest } from "../../../../lib/crypto.ts";

export const GET = defineHandler.withValidator({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  }),
})(async (c, { query }) => {
  await requireAdmin(c);
  const items = await db
    .select({
      id: invites.id,
      createdBy: invites.createdBy,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
      usedAt: invites.usedAt,
      revokedAt: invites.revokedAt,
    })
    .from(invites)
    .orderBy(desc(invites.createdAt))
    .limit(query.limit)
    .offset(query.offset);
  return { items, ...query };
});
export const POST = defineHandler.withValidator({
  body: z
    .object({
      expiresAt: z
        .number()
        .int()
        .positive()
        .refine((v) => v > Date.now(), "Expiry must be in the future")
        .nullable()
        .optional(),
    })
    .strict(),
})(async (c, { body }) => {
  const admin = await requireAdmin(c);
  const code = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const invite = {
    id: crypto.randomUUID(),
    tokenHash: await digest(code),
    createdBy: admin.userId,
    createdAt: Date.now(),
    expiresAt: body.expiresAt ?? null,
  };
  await db.insert(invites).values(invite);
  const { tokenHash: _hash, ...result } = invite;
  return c.json({ invite: { ...result, usedAt: null, revokedAt: null }, code }, 201);
});
