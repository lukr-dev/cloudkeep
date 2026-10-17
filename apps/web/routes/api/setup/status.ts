import { defineHandler } from "void";

export const GET = defineHandler(async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT (EXISTS (SELECT 1 FROM user) OR EXISTS (SELECT 1 FROM setup)) AS complete",
  ).first<{ complete: number }>();
  return { needsSetup: !row?.complete };
});
