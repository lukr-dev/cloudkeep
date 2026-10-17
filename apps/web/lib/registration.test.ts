import { afterEach, expect, it } from "vite-plus/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { registrationStatements } from "./registration-plan.ts";

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function database() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  return db;
}
function register(db: DatabaseSync, id: string, email = `${id}@example.com`, inviteHash?: string) {
  const plan = registrationStatements(
    { name: id, email, password: "unused" },
    id,
    "hash",
    1_000,
    inviteHash,
  );
  db.exec("BEGIN");
  try {
    let changes = 0;
    for (const [index, statement] of plan.entries()) {
      const result = db.prepare(statement.sql).run(...statement.values);
      if (index === 1) changes = Number(result.changes);
    }
    db.exec("COMMIT");
    return changes;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
it("creates only one setup admin and keeps setup closed after all users are removed", () => {
  const db = database();
  expect(register(db, "first")).toBe(1);
  expect(register(db, "second")).toBe(0);
  expect(db.prepare("SELECT role FROM profiles").get()).toMatchObject({ role: "admin" });
  expect(db.prepare("SELECT count(*) AS n FROM user").get()).toMatchObject({ n: 1 });
  db.exec("DELETE FROM user");
  expect(register(db, "third")).toBe(0);
});
it("consumes invites once and rolls back consumption on an email conflict", () => {
  const db = database();
  register(db, "admin");
  db.exec(
    "INSERT INTO invites (id, token_hash, created_by, created_at) VALUES ('invite', 'valid', 'admin', 0)",
  );
  expect(() => register(db, "conflict", "admin@example.com", "valid")).toThrow();
  expect(db.prepare("SELECT used_by FROM invites").get()).toMatchObject({ used_by: null });
  expect(register(db, "invited", "invited@example.com", "valid")).toBe(1);
  expect(register(db, "racer", "racer@example.com", "valid")).toBe(0);
  expect(db.prepare("SELECT role FROM profiles WHERE user_id = 'invited'").get()).toMatchObject({
    role: "user",
  });
});
it("rejects missing, expired and revoked invites without creating accounts", () => {
  const db = database();
  register(db, "admin");
  db.exec(
    "INSERT INTO invites (id, token_hash, created_by, created_at, expires_at) VALUES ('expired', 'expired', 'admin', 0, 999)",
  );
  db.exec(
    "INSERT INTO invites (id, token_hash, created_by, created_at, revoked_at) VALUES ('revoked', 'revoked', 'admin', 0, 500)",
  );
  for (const hash of ["missing", "expired", "revoked"])
    expect(register(db, hash, `${hash}@example.com`, hash)).toBe(0);
  expect(db.prepare("SELECT count(*) AS n FROM account").get()).toMatchObject({ n: 1 });
});
