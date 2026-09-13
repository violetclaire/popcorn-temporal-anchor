CREATE TABLE IF NOT EXISTS entries (
 id TEXT PRIMARY KEY,
 parent_id TEXT REFERENCES entries(id),
 kind TEXT NOT NULL CHECK(kind IN ('request','reply','decision')),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 public_json TEXT,
 public_digest TEXT NOT NULL,
 control_hash TEXT NOT NULL,
 withdrawn INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS entries_parent ON entries(parent_id,created_at);
CREATE INDEX IF NOT EXISTS entries_created ON entries(created_at);
