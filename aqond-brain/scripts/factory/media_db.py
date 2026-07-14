"""SQLite schema for AQOND Media Studio (3 flows + chat + success library)."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

AQOND_BRAIN = Path(__file__).resolve().parent.parent.parent
DB_PATH = AQOND_BRAIN / "output" / "media_studio" / "media_studio.db"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS studio_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            flow_type TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS studio_uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            path TEXT NOT NULL,
            mime TEXT,
            flow_type TEXT,
            vision_summary TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS media_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flow_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            topic TEXT,
            theme TEXT,
            user_brief TEXT,
            script_text TEXT,
            outputs_json TEXT,
            qc_score REAL,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS success_examples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            flow_type TEXT NOT NULL,
            tags_json TEXT,
            qwen_labels_json TEXT,
            engagement_score REAL DEFAULT 0,
            media_paths_json TEXT,
            chat_snapshot TEXT,
            preset_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (job_id) REFERENCES media_jobs(id)
        );
        """
    )
    try:
        conn.execute("ALTER TABLE success_examples ADD COLUMN preset_json TEXT")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()


def add_message(role: str, content: str, flow_type: str | None = None) -> int:
    conn = connect()
    cur = conn.execute(
        "INSERT INTO studio_messages (role, content, flow_type, created_at) VALUES (?,?,?,?)",
        (role, content, flow_type, _now()),
    )
    conn.commit()
    mid = int(cur.lastrowid)
    conn.close()
    return mid


def list_messages(limit: int = 50, flow_type: str | None = None) -> list[dict[str, Any]]:
    conn = connect()
    if flow_type:
        rows = conn.execute(
            "SELECT * FROM studio_messages WHERE flow_type IS NULL OR flow_type=? ORDER BY id DESC LIMIT ?",
            (flow_type, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM studio_messages ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def add_upload(filename: str, path: str, mime: str | None, flow_type: str | None, vision_summary: str = "") -> int:
    conn = connect()
    cur = conn.execute(
        "INSERT INTO studio_uploads (filename, path, mime, flow_type, vision_summary, created_at) VALUES (?,?,?,?,?,?)",
        (filename, path, mime, flow_type, vision_summary, _now()),
    )
    conn.commit()
    uid = int(cur.lastrowid)
    conn.close()
    return uid


def list_uploads(limit: int = 20) -> list[dict[str, Any]]:
    conn = connect()
    rows = conn.execute(
        "SELECT * FROM studio_uploads ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_job(flow_type: str, topic: str = "", theme: str = "", user_brief: str = "") -> int:
    now = _now()
    conn = connect()
    cur = conn.execute(
        """INSERT INTO media_jobs (flow_type, status, topic, theme, user_brief, created_at, updated_at)
           VALUES (?, 'running', ?, ?, ?, ?, ?)""",
        (flow_type, topic, theme, user_brief, now, now),
    )
    conn.commit()
    jid = int(cur.lastrowid)
    conn.close()
    return jid


def update_job(job_id: int, **fields: Any) -> None:
    allowed = {"status", "script_text", "outputs_json", "qc_score", "error", "topic", "theme", "user_brief"}
    parts: list[str] = []
    vals: list[Any] = []
    for k, v in fields.items():
        if k not in allowed:
            continue
        if k == "outputs_json" and isinstance(v, dict):
            v = json.dumps(v, ensure_ascii=False)
        parts.append(f"{k}=?")
        vals.append(v)
    if not parts:
        return
    parts.append("updated_at=?")
    vals.append(_now())
    vals.append(job_id)
    conn = connect()
    conn.execute(f"UPDATE media_jobs SET {', '.join(parts)} WHERE id=?", vals)
    conn.commit()
    conn.close()


def get_job(job_id: int) -> dict[str, Any] | None:
    conn = connect()
    row = conn.execute("SELECT * FROM media_jobs WHERE id=?", (job_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("outputs_json"):
        try:
            d["outputs"] = json.loads(d["outputs_json"])
        except json.JSONDecodeError:
            d["outputs"] = {}
    return d


def list_jobs(flow_type: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    conn = connect()
    if flow_type:
        rows = conn.execute(
            "SELECT * FROM media_jobs WHERE flow_type=? ORDER BY id DESC LIMIT ?",
            (flow_type, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM media_jobs ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        if d.get("outputs_json"):
            try:
                d["outputs"] = json.loads(d["outputs_json"])
            except json.JSONDecodeError:
                d["outputs"] = {}
        out.append(d)
    return out


def add_success_example(
    flow_type: str,
    job_id: int | None,
    tags: list[str],
    qwen_labels: dict[str, Any],
    media_paths: list[str],
    chat_snapshot: str,
    engagement_score: float = 0.0,
    preset_json: dict[str, Any] | None = None,
) -> int:
    conn = connect()
    cur = conn.execute(
        """INSERT INTO success_examples
           (job_id, flow_type, tags_json, qwen_labels_json, engagement_score,
            media_paths_json, chat_snapshot, preset_json, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            job_id,
            flow_type,
            json.dumps(tags, ensure_ascii=False),
            json.dumps(qwen_labels, ensure_ascii=False),
            engagement_score,
            json.dumps(media_paths, ensure_ascii=False),
            chat_snapshot,
            json.dumps(preset_json, ensure_ascii=False) if preset_json else None,
            _now(),
        ),
    )
    conn.commit()
    sid = int(cur.lastrowid)
    conn.close()
    return sid


def list_success_examples(flow_type: str | None = None, limit: int = 30) -> list[dict[str, Any]]:
    conn = connect()
    if flow_type:
        rows = conn.execute(
            "SELECT * FROM success_examples WHERE flow_type=? ORDER BY id DESC LIMIT ?",
            (flow_type, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM success_examples ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        for key in ("tags_json", "qwen_labels_json", "media_paths_json", "preset_json"):
            if d.get(key):
                try:
                    d[key.replace("_json", "")] = json.loads(d[key])
                except json.JSONDecodeError:
                    d[key.replace("_json", "")] = d[key]
        out.append(d)
    return out
