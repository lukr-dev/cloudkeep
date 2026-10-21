import { expect, it } from "vite-plus/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

it("preserves bookmarks and all cascading memberships with foreign keys enabled", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const dir = new URL("../db/migrations/", import.meta.url);
    const files = readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files.filter((file) => file.startsWith("20261017")))
      db.exec(readFileSync(new URL(file, dir), "utf8"));
    db.exec(`
      INSERT INTO profiles (user_id) VALUES ('owner');
      INSERT INTO bookmarks (id, user_id, url, run_id, created_at, updated_at)
        VALUES ('a', 'owner', 'https://example.com/a', 'run-a', 1, 2),
               ('b', 'owner', 'https://example.com/b', 'run-b', 3, 4);
      INSERT INTO lists VALUES ('l1', 'owner', 'First', 1, 1), ('l2', 'owner', 'Second', 1, 1);
      INSERT INTO tags VALUES ('t1', 'owner', 'one'), ('t2', 'owner', 'two');
      INSERT INTO bookmark_lists VALUES ('a', 'l1'), ('a', 'l2'), ('b', 'l2');
      INSERT INTO bookmark_tags VALUES ('a', 't1', 'manual'), ('a', 't2', 'ai'), ('b', 't2', 'manual');
    `);
    const before = db.prepare("SELECT * FROM bookmarks ORDER BY id").all();
    const listLinks = db
      .prepare("SELECT * FROM bookmark_lists ORDER BY bookmark_id, list_id")
      .all();
    const tagLinks = db.prepare("SELECT * FROM bookmark_tags ORDER BY bookmark_id, tag_id").all();
    // D1 runs migrations transactionally and ignores foreign_keys=OFF.
    db.exec("BEGIN");
    for (const file of files.filter((file) => !file.startsWith("20261017")))
      db.exec(readFileSync(new URL(file, dir), "utf8"));
    db.exec("COMMIT");
    expect(db.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
    expect(db.prepare("SELECT * FROM bookmarks ORDER BY id").all()).toEqual(
      before.map((row) => ({
        ...row,
        type: "link",
        note_text: null,
        asset_key: null,
        asset_type: null,
        asset_mime: null,
        asset_name: null,
        asset_size: null,
        archived_at: null,
      })),
    );
    expect(db.prepare("SELECT * FROM bookmark_lists ORDER BY bookmark_id, list_id").all()).toEqual(
      listLinks,
    );
    expect(db.prepare("SELECT * FROM bookmark_tags ORDER BY bookmark_id, tag_id").all()).toEqual(
      tagLinks,
    );
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.exec(`INSERT INTO bookmarks (id, user_id, type, run_id, created_at, updated_at)
      VALUES ('note', 'owner', 'text', 'n', 1, 1), ('file', 'owner', 'asset', 'f', 1, 1)`);
    db.exec("DELETE FROM bookmarks WHERE id = 'a'");
    expect(db.prepare("SELECT * FROM bookmark_lists WHERE bookmark_id = 'a'").all()).toEqual([]);
    expect(db.prepare("SELECT * FROM bookmark_tags WHERE bookmark_id = 'a'").all()).toEqual([]);
  } finally {
    db.close();
  }
});
