import { db, and, eq, inArray } from "void/db";
import { lists, prompts } from "../db/schema.ts";
import { chooseProcessingList } from "./list-settings.ts";
export async function processingListForCreate(userId: string, ids: string[]) {
  if (!ids.length) return null;
  const rows = await db
    .select()
    .from(lists)
    .where(and(eq(lists.userId, userId), inArray(lists.id, ids)));
  const templates = await db
    .select({ listId: prompts.listId })
    .from(prompts)
    .where(and(eq(prompts.userId, userId), inArray(prompts.listId, ids)));
  return chooseProcessingList(
    ids,
    rows,
    templates.map((p) => p.listId),
  );
}
export async function processingList(userId: string, id: string | null) {
  if (!id) return undefined;
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.userId, userId), eq(lists.id, id)));
  return list;
}
