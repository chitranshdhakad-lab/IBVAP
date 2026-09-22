import sqlite3
import os

db_path = "backend/storage/surveillance.db"
if not os.path.exists(db_path):
    print("DB not found at", db_path)
    exit(1)

con = sqlite3.connect(db_path)
cur = con.cursor()
tables = [row[0] for row in cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
print("=== TABLES AND ROW COUNTS ===")
for t in tables:
    count = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    print(f"  {t}: {count} rows")

print("\n=== FOREIGN KEYS IN SCHEMA ===")
for t in tables:
    fks = cur.execute(f'PRAGMA foreign_key_list("{t}")').fetchall()
    if fks:
        print(f"  {t}:")
        for fk in fks:
            print(f"    -> references {fk[2]}({fk[4]}) on_update={fk[5]} on_delete={fk[6]}")

print("\n=== INDEXES IN SCHEMA ===")
indexes = cur.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index'").fetchall()
for idx in indexes:
    print(f"  {idx[0]} on {idx[1]}: {idx[2]}")
