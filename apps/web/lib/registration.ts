import type { CloudContext } from "void";
import { registrationStatements, type Registration } from "./registration-plan.ts";
export { registrationBody } from "./registration-plan.ts";
import { digest, hashPassword } from "./crypto.ts";
import { fail } from "./http.ts";

export async function register(c: CloudContext, input: Registration, invite?: string) {
  const id = crypto.randomUUID();
  const statements = registrationStatements(
    input,
    id,
    await hashPassword(input.password),
    Date.now(),
    invite ? await digest(invite) : undefined,
  );
  let result: D1Result[];
  try {
    result = await c.env.DB.batch(statements.map((s) => c.env.DB.prepare(s.sql).bind(...s.values)));
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: user.email"))
      return fail(409, "An account already exists for this email");
    throw error;
  }
  if (!result[1]?.meta.changes)
    return fail(
      409,
      invite ? "Invite is invalid, expired, revoked, or used" : "Setup is already complete",
    );
  return {
    user: {
      id,
      name: input.name,
      email: input.email,
      role: invite ? ("user" as const) : ("admin" as const),
    },
  };
}
