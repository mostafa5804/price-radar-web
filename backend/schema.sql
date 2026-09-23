CREATE TABLE IF NOT EXISTS watch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK(platform IN ('divar','digikala','both')),
  kind TEXT NOT NULL CHECK(kind IN ('query','product')),
  query TEXT,
  target_id TEXT,
  title TEXT NOT NULL,
  city TEXT,
  category TEXT,
  budget INTEGER,
  last_price INTEGER,
  last_checked TEXT,
  created_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS watch_active_idx ON watch(active,id);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  checked_at TEXT NOT NULL,
  FOREIGN KEY(watch_id) REFERENCES watch(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS price_history_watch_idx ON price_history(watch_id,id);

CREATE TABLE IF NOT EXISTS login_limits (
  ip TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
