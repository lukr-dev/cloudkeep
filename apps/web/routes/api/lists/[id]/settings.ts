import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, and, eq, sql } from "void/db";
import { z } from "zod";
import { lists, prompts } from "../../../../db/schema.ts";
import { idParams, ownList, profileFor, fail } from "../../../../lib/http.ts";
import { providerSchema, reasoningEffortSchema } from "../../../../lib/providers.ts";
import { effectivePrompts } from "../../../../lib/settings.ts";
import { filesEnabled, FILES_DISABLED_MESSAGE } from "../../../../lib/assets.ts";
import { promptKind } from "../../../../lib/prompts.ts";
const optionalText = z.string().trim().min(1).max(200).nullable();
const body = z
  .object({
    provider: providerSchema.nullable(),
    model: optionalText,
    reasoningEffort: reasoningEffortSchema.nullable(),
    audioEnabled: z.boolean().optional(),
    ttsProvider: providerSchema.nullable().optional(),
    ttsModel: optionalText.optional(),
    ttsVoice: optionalText.optional(),
    prompts: z
      .object({
        tagging: z.string().trim().min(1).max(12000).nullable(),
        summary: z.string().trim().min(1).max(12000).nullable(),
        detailed_summary: z.string().trim().min(1).max(12000).nullable(),
      })
      .strict(),
  })
  .strict();
export const GET = defineHandler.withValidator({ params: idParams })(async (c, { params }) => {
  const userId = requireAuth(c).id;
  return {
    list: await ownList(userId, params.id),
    prompts: await effectivePrompts(userId, params.id),
  };
});
export const PUT = defineHandler.withValidator({ params: idParams, body })(async (
  c,
  { params, body },
) => {
  const userId = requireAuth(c).id;
  const list = await ownList(userId, params.id);
  if (
    !filesEnabled() &&
    (body.audioEnabled !== undefined ||
      body.ttsProvider !== undefined ||
      body.ttsModel !== undefined ||
      body.ttsVoice !== undefined)
  )
    return fail(503, FILES_DISABLED_MESSAGE);
  const profile = await profileFor(c);
  for (const provider of [body.provider, body.ttsProvider]) {
    if (
      provider &&
      provider !== "workers-ai" &&
      !(provider === "openai" ? profile.openaiKey : profile.openrouterKey)
    )
      return fail(400, `Set an API key for ${provider} in Settings first`);
  }
  const { prompts: templates, ...settings } = body;
  await db.batch([
    db
      .update(lists)
      .set({
        ...settings,
        ...(settings.provider ? {} : { model: null, reasoningEffort: null }),
        ...(settings.ttsProvider === null ? { ttsModel: null, ttsVoice: null } : {}),
        updatedAt: Date.now(),
      })
      .where(and(eq(lists.userId, userId), eq(lists.id, list.id))),
    ...promptKind.options.map((kind) =>
      templates[kind] === null
        ? db
            .delete(prompts)
            .where(
              and(eq(prompts.userId, userId), eq(prompts.listId, list.id), eq(prompts.kind, kind)),
            )
        : db
            .insert(prompts)
            .values({
              id: crypto.randomUUID(),
              userId,
              listId: list.id,
              kind,
              template: templates[kind]!,
            })
            .onConflictDoUpdate({
              target: [prompts.userId, prompts.listId, prompts.kind],
              targetWhere: sql`${prompts.listId} is not null`,
              set: { template: templates[kind]! },
            }),
    ),
  ]);
  return { list: await ownList(userId, list.id), prompts: await effectivePrompts(userId, list.id) };
});
