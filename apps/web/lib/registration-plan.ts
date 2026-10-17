import { z } from "zod";

export const registrationBody = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export type Registration = z.infer<typeof registrationBody>;
export type Statement = { sql: string; values: (string | number)[] };
export function registrationStatements(
  input: Registration,
  id: string,
  hash: string,
  now: number,
  inviteHash?: string,
): Statement[] {
  const claim: Statement = inviteHash
    ? {
        sql: "UPDATE invites SET used_by = ?, used_at = ? WHERE token_hash = ? AND used_by IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)",
        values: [id, now, inviteHash, now],
      }
    : {
        sql: "INSERT OR IGNORE INTO setup (id, user_id) SELECT 1, ? WHERE NOT EXISTS (SELECT 1 FROM user)",
        values: [id],
      };
  return [
    claim,
    {
      sql: `INSERT INTO profiles (user_id, role) SELECT ?, ? WHERE EXISTS (${inviteHash ? "SELECT 1 FROM invites WHERE token_hash = ? AND used_by = ?" : "SELECT 1 FROM setup WHERE id = 1 AND user_id = ?"})`,
      values: [id, inviteHash ? "user" : "admin", ...(inviteHash ? [inviteHash, id] : [id])],
    },
    {
      sql: "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) SELECT ?, ?, ?, 0, ?, ? WHERE EXISTS (SELECT 1 FROM profiles WHERE user_id = ?)",
      values: [id, input.name, input.email, now, now, id],
    },
    {
      sql: "INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) SELECT ?, ?, 'credential', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM profiles WHERE user_id = ?)",
      values: [crypto.randomUUID(), id, id, hash, now, now, id],
    },
  ];
}
