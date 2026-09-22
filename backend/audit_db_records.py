import sqlite3

con = sqlite3.connect("backend/storage/surveillance.db")
con.row_factory = sqlite3.Row
cur = con.cursor()

print("--- CAMERAS ---")
for r in cur.execute("SELECT id, name, status, sector FROM cameras").fetchall():
    print(dict(r))

print("\n--- VIDEOS ---")
for r in cur.execute("SELECT id, filename, camera_id, processing_status, total_frames, duration FROM videos").fetchall():
    print(dict(r))

print("\n--- ANALYSIS JOBS ---")
for r in cur.execute("SELECT id, video_filename, camera_id, status, processed_frames, total_frames FROM analysis_jobs").fetchall():
    print(dict(r))

print("\n--- EVENTS: VIDEO FILENAMES & CAMERAS ---")
for r in cur.execute("SELECT DISTINCT camera_id FROM security_events").fetchall():
    print("  Event camera_id:", r[0])

for r in cur.execute("SELECT json_extract(details, '$.video_filename') as vf, count(*) as cnt FROM security_events GROUP BY vf").fetchall():
    print("  Event video_filename in details:", r['vf'], "Count:", r['cnt'])

print("\n--- STALE JOBS OR VIDEOS ---")
stale_jobs = cur.execute("SELECT * FROM analysis_jobs WHERE status IN ('RUNNING', 'PROCESSING')").fetchall()
print("  Stale running jobs:", len(stale_jobs))
for j in stale_jobs:
    print("   ", dict(j))

stale_vids = cur.execute("SELECT * FROM videos WHERE processing_status IN ('RUNNING', 'PROCESSING')").fetchall()
print("  Stale running videos:", len(stale_vids))
for v in stale_vids:
    print("   ", dict(v))

print("\n--- ORPHAN ALERTS ---")
orphan_alerts = cur.execute("SELECT id, event_id FROM alerts WHERE event_id NOT IN (SELECT id FROM security_events)").fetchall()
print("  Orphan alerts:", len(orphan_alerts))

print("\n--- ORPHAN SNAPSHOTS ---")
orphan_snaps = cur.execute("SELECT id, event_id, filepath FROM snapshots WHERE event_id NOT IN (SELECT id FROM security_events)").fetchall()
print("  Orphan snapshots:", len(orphan_snaps))
