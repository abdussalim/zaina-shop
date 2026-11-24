-- Monitor / CCTV Hybrid State, Daily Visitors, and Event Logs

CREATE TABLE IF NOT EXISTS monitor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_active INTEGER NOT NULL DEFAULT 1,
  op_mode TEXT NOT NULL DEFAULT 'watch' CHECK (op_mode IN ('watch', 'serving')),
  door_closed INTEGER NOT NULL DEFAULT 0,
  cam1_active INTEGER NOT NULL DEFAULT 1,
  cam2_active INTEGER NOT NULL DEFAULT 1,
  stream_base_url TEXT,
  cpu_percent REAL NOT NULL DEFAULT 0,
  mem_percent REAL NOT NULL DEFAULT 0,
  gpu_percent REAL NOT NULL DEFAULT 0,
  server_specs_json TEXT,
  last_heartbeat_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO monitor_state (
  id, is_active, op_mode, door_closed, cam1_active, cam2_active
) VALUES (1, 1, 'watch', 0, 1, 1);

CREATE TABLE IF NOT EXISTS monitor_visitors_daily (
  date TEXT PRIMARY KEY,
  total_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monitor_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  camera_id TEXT,
  label TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_monitor_events_created_at
  ON monitor_events (created_at DESC);
