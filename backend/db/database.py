import sqlite3
import json
from datetime import datetime

DB_PATH = "gemmashield.db"
JSONL_PATH = "audit_log.jsonl"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS battles (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            battle_id        TEXT UNIQUE NOT NULL,
            timestamp        TEXT NOT NULL,
            target_system    TEXT,
            attack_type      TEXT,
            owasp_id         TEXT,
            owasp_name       TEXT,
            severity         TEXT,
            blocked          INTEGER,
            risk_score       REAL,
            cvss_score       REAL,
            patch_priority   TEXT,
            total_latency_ms INTEGER,
            full_data        TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def log_battle(battle: dict):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    atk = battle.get("attack", {}).get("output", {})
    def_ = battle.get("defense", {}).get("output", {})
    jdg = battle.get("verdict", {}).get("output", {})
    owasp = atk.get("owasp", {})

    c.execute("""
        INSERT OR REPLACE INTO battles
        (battle_id, timestamp, target_system, attack_type, owasp_id, owasp_name,
         severity, blocked, risk_score, cvss_score, patch_priority, total_latency_ms, full_data)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        battle["battle_id"],
        battle["timestamp"],
        battle.get("target_system"),
        atk.get("attack_type"),
        owasp.get("id"),
        owasp.get("name"),
        atk.get("severity") or jdg.get("severity"),
        1 if def_.get("blocked") else 0,
        jdg.get("risk_score"),
        jdg.get("cvss_like_score"),
        jdg.get("patch_priority"),
        battle.get("total_latency_ms"),
        json.dumps(battle),
    ))
    conn.commit()
    conn.close()

    with open(JSONL_PATH, "a") as f:
        f.write(json.dumps(battle) + "\n")


def get_all_battles(limit: int = 100):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT full_data FROM battles ORDER BY timestamp DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    return [json.loads(r[0]) for r in rows]


def get_battle_by_id(battle_id: str):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT full_data FROM battles WHERE battle_id = ?", (battle_id,))
    row = c.fetchone()
    conn.close()
    return json.loads(row[0]) if row else None


def get_stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    def q(sql, default=0):
        c.execute(sql)
        r = c.fetchone()
        return r[0] if r and r[0] is not None else default

    total    = q("SELECT COUNT(*) FROM battles")
    blocked  = q("SELECT COUNT(*) FROM battles WHERE blocked = 1")
    breached = total - blocked
    avg_risk = q("SELECT AVG(risk_score) FROM battles")
    avg_cvss = q("SELECT AVG(cvss_score) FROM battles")
    avg_lat  = q("SELECT AVG(total_latency_ms) FROM battles")

    c.execute("SELECT attack_type, COUNT(*) FROM battles GROUP BY attack_type ORDER BY 2 DESC")
    attack_dist = [{"type": r[0], "count": r[1]} for r in c.fetchall() if r[0]]

    c.execute("SELECT severity, COUNT(*) FROM battles GROUP BY severity")
    severity_dist = [{"severity": r[0], "count": r[1]} for r in c.fetchall() if r[0]]

    c.execute("SELECT patch_priority, COUNT(*) FROM battles GROUP BY patch_priority")
    priority_dist = [{"priority": r[0], "count": r[1]} for r in c.fetchall() if r[0]]

    # OWASP distribution
    c.execute("SELECT owasp_id, owasp_name, COUNT(*) FROM battles WHERE owasp_id IS NOT NULL GROUP BY owasp_id ORDER BY 3 DESC")
    owasp_dist = [{"id": r[0], "name": r[1], "count": r[2]} for r in c.fetchall()]

    # Success rate per attack type
    c.execute("""
        SELECT attack_type,
               COUNT(*) as total,
               SUM(CASE WHEN blocked=0 THEN 1 ELSE 0 END) as breached
        FROM battles GROUP BY attack_type
    """)
    attack_success = []
    for r in c.fetchall():
        if r[0]:
            rate = round(r[2] / r[1] * 100, 1) if r[1] > 0 else 0
            attack_success.append({"type": r[0], "total": r[1], "breached": r[2], "success_rate": rate})

    conn.close()

    return {
        "total_battles": total,
        "blocked_attacks": blocked,
        "breached_attacks": breached,
        "block_rate": round(blocked / total * 100, 1) if total else 0,
        "breach_rate": round(breached / total * 100, 1) if total else 0,
        "avg_risk_score": round(avg_risk, 2),
        "avg_cvss_score": round(avg_cvss, 2),
        "avg_latency_ms": round(avg_lat),
        "attack_distribution": attack_dist,
        "severity_distribution": severity_dist,
        "priority_distribution": priority_dist,
        "owasp_distribution": owasp_dist,
        "attack_success_rates": attack_success,
    }


def generate_report(battle_id: str) -> dict:
    """Generate a full security report for a single battle."""
    battle = get_battle_by_id(battle_id)
    if not battle:
        return None

    atk = battle.get("attack", {}).get("output", {})
    def_ = battle.get("defense", {}).get("output", {})
    jdg = battle.get("verdict", {}).get("output", {})
    owasp = atk.get("owasp", {})

    return {
        "report_id": battle_id,
        "generated_at": datetime.utcnow().isoformat(),
        "target_system": battle.get("target_system"),
        "timestamp": battle.get("timestamp"),
        "executive_summary": (
            f"Security assessment identified a {atk.get('severity', 'UNKNOWN')} severity "
            f"{atk.get('attack_type', 'unknown').replace('_', ' ')} vulnerability "
            f"({'successfully blocked' if def_.get('blocked') else 'BREACHED — immediate action required'})."
        ),
        "owasp_category": owasp,
        "attack": {
            "type": atk.get("attack_type"),
            "prompt": atk.get("attack_prompt"),
            "technique": atk.get("technique"),
            "target_weakness": atk.get("target_weakness"),
            "severity": atk.get("severity"),
            "stealth_score": atk.get("stealth_score"),
        },
        "defense": {
            "blocked": def_.get("blocked"),
            "risk_score": def_.get("risk_score"),
            "threat_category": def_.get("threat_category"),
            "confidence": def_.get("confidence"),
            "reasoning": def_.get("reasoning_steps", []),
            "strategy": def_.get("defense_strategy"),
        },
        "verdict": {
            "cvss_like_score": jdg.get("cvss_like_score"),
            "severity": jdg.get("severity"),
            "vulnerability_label": jdg.get("vulnerability_label"),
            "patch_priority": jdg.get("patch_priority"),
            "recommendation": jdg.get("recommendation"),
            "judge_reasoning": jdg.get("judge_reasoning"),
        },
        "traceability": {
            "attacker_latency_ms": battle.get("attack", {}).get("latency_ms"),
            "target_latency_ms": battle.get("target", {}).get("latency_ms"),
            "defender_latency_ms": battle.get("defense", {}).get("latency_ms"),
            "judge_latency_ms": battle.get("verdict", {}).get("latency_ms"),
            "total_latency_ms": battle.get("total_latency_ms"),
            "model": "gemma4:latest",
            "source": "ollama",
        }
    }