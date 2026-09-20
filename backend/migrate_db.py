import sqlite3
import datetime
from pathlib import Path

db_path = Path(__file__).resolve().parent / "storage" / "surveillance.db"
con = sqlite3.connect(str(db_path))
cur = con.cursor()

# 1. Update cameras table columns
cols = [r[1] for r in cur.execute("PRAGMA table_info(cameras)").fetchall()]
if "source_type" not in cols:
    cur.execute("ALTER TABLE cameras ADD COLUMN source_type VARCHAR(32) DEFAULT 'FILE'")
    print("Added source_type to cameras")
if "source" not in cols:
    cur.execute("ALTER TABLE cameras ADD COLUMN source VARCHAR(512) DEFAULT ''")
    print("Added source to cameras")
if "created_at" not in cols:
    cur.execute("ALTER TABLE cameras ADD COLUMN created_at DATETIME")
    print("Added created_at to cameras")
if "last_seen" not in cols:
    cur.execute("ALTER TABLE cameras ADD COLUMN last_seen DATETIME")
    print("Added last_seen to cameras")

# Set created_at for existing cameras if null
cur.execute("UPDATE cameras SET created_at = ? WHERE created_at IS NULL", (datetime.datetime.utcnow().isoformat(),))
cur.execute("UPDATE cameras SET last_seen = ? WHERE last_seen IS NULL AND status = 'ACTIVE'", (datetime.datetime.utcnow().isoformat(),))

# 2. Create system_settings table if not exists
cur.execute("""
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME
)
""")

# 3. Create analysis_jobs table if not exists
cur.execute("""
CREATE TABLE IF NOT EXISTS analysis_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER,
    video_filename VARCHAR(256) NOT NULL,
    camera_id VARCHAR(32) NOT NULL,
    status VARCHAR(32) DEFAULT 'IDLE',
    started_at DATETIME,
    completed_at DATETIME,
    processed_frames INTEGER DEFAULT 0,
    total_frames INTEGER DEFAULT 0,
    error_message TEXT
)
""")

con.commit()
print("Migration completed successfully.")
print("Updated cameras columns:", [r[1] for r in cur.execute("PRAGMA table_info(cameras)").fetchall()])
print("Tables:", [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()])
con.close()
