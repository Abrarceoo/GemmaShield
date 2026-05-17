"""
GemmaShield API v2.1 — Single backend authority.
"""
import uuid
import json
import asyncio
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from db.database import init_db, log_battle, get_all_battles, get_battle_by_id, get_stats, generate_report
from agents.attacker import generate_attack
from agents.target import get_target_response
from agents.defender import analyze_defense
from agents.judge import evaluate
from llm_client import LLMUnavailableError, LLMOutputError
from scenarios import get_system_prompt, SYSTEM_PROMPTS

app = FastAPI(title="GemmaShield", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


def llm_error_response(e: Exception) -> dict:
    if isinstance(e, LLMUnavailableError):
        return {"error": "MODEL_UNAVAILABLE", "detail": str(e)}
    if isinstance(e, LLMOutputError):
        return {"error": "MODEL_OUTPUT_ERROR", "detail": str(e)}
    return {"error": "INTERNAL_ERROR", "detail": str(e)}


# ─── Scenarios ────────────────────────────────────────────────────────────────

@app.get("/scenarios")
def get_scenarios():
    return {
        "scenarios": [
            {"name": k, "system_prompt": v, "preview": v.split("\n")[0]}
            for k, v in SYSTEM_PROMPTS.items()
        ]
    }


# ─── Battle pipeline ──────────────────────────────────────────────────────────

@app.post("/battle")
def run_battle(
    target_system: str = Query("Healthcare AI Assistant"),
    attack_type: str = Query("any"),
):
    battle_id = str(uuid.uuid4())[:8]
    start_ts = datetime.utcnow()
    system_prompt = get_system_prompt(target_system)

    try:
        attack  = generate_attack(target_system, attack_type, system_prompt)
        target  = get_target_response(target_system, attack["output"]["attack_prompt"], system_prompt)
        defense = analyze_defense(
            attack_type     = attack["output"]["attack_type"],
            technique       = attack["output"]["technique"],
            target_system   = target_system,
            attack_prompt   = attack["output"]["attack_prompt"],
            target_response = target["output"]["response"],
        )
        verdict = evaluate(attack, target["output"]["response"], defense)
    except (LLMUnavailableError, LLMOutputError) as e:
        raise HTTPException(status_code=503, detail=llm_error_response(e))

    total_latency = (
        attack["latency_ms"] + target["latency_ms"] +
        defense["latency_ms"] + verdict["latency_ms"]
    )

    battle = {
        "battle_id": battle_id,
        "timestamp": start_ts.isoformat(),
        "target_system": target_system,
        "system_prompt": system_prompt,
        "attack": attack,
        "target": target,
        "defense": defense,
        "verdict": verdict,
        "total_latency_ms": total_latency,
    }
    log_battle(battle)
    return battle


@app.post("/battle/stream")
async def run_battle_stream(
    target_system: str = Query("Healthcare AI Assistant"),
    attack_type: str = Query("any"),
):
    system_prompt = get_system_prompt(target_system)

    async def generate():
        battle_id = str(uuid.uuid4())[:8]
        start_ts = datetime.utcnow()
        results = {}

        def emit(phase: str, data: dict):
            return f"data: {json.dumps({'phase': phase, **data})}\n\n"

        yield emit("init", {
            "battle_id": battle_id,
            "target_system": target_system,
            "system_prompt": system_prompt,
        })
        await asyncio.sleep(0.1)

        # ATTACK
        yield emit("attacker_start", {"message": "Attacker Agent calling Gemma 4..."})
        try:
            loop = asyncio.get_event_loop()
            attack = await loop.run_in_executor(
                None, generate_attack, target_system, attack_type, system_prompt
            )
            results["attack"] = attack
            yield emit("attacker_done", attack)
        except (LLMUnavailableError, LLMOutputError) as e:
            yield emit("error", llm_error_response(e))
            return

        await asyncio.sleep(0.1)

        # TARGET
        yield emit("target_start", {"message": "Target Agent calling Gemma 4..."})
        try:
            target = await loop.run_in_executor(
                None, get_target_response,
                target_system, attack["output"]["attack_prompt"], system_prompt
            )
            results["target"] = target
            yield emit("target_done", target)
        except LLMUnavailableError as e:
            yield emit("error", llm_error_response(e))
            return

        await asyncio.sleep(0.1)

        # DEFEND
        yield emit("defender_start", {"message": "Defender Agent calling Gemma 4..."})
        try:
            defense = await loop.run_in_executor(
                None, analyze_defense,
                attack["output"]["attack_type"],
                attack["output"]["technique"],
                target_system,
                attack["output"]["attack_prompt"],
                target["output"]["response"],
            )
            results["defense"] = defense
            yield emit("defender_done", defense)
        except (LLMUnavailableError, LLMOutputError) as e:
            yield emit("error", llm_error_response(e))
            return

        await asyncio.sleep(0.1)

        # JUDGE
        yield emit("judge_start", {"message": "Judge Agent calling Gemma 4..."})
        try:
            verdict = await loop.run_in_executor(
                None, evaluate, attack, target["output"]["response"], defense
            )
            results["verdict"] = verdict
            yield emit("judge_done", verdict)
        except (LLMUnavailableError, LLMOutputError) as e:
            yield emit("error", llm_error_response(e))
            return

        # LOG
        total_latency = sum(r["latency_ms"] for r in results.values())
        battle = {
            "battle_id": battle_id,
            "timestamp": start_ts.isoformat(),
            "target_system": target_system,
            "system_prompt": system_prompt,
            **results,
            "total_latency_ms": total_latency,
        }
        log_battle(battle)

        yield emit("complete", {
            "battle_id": battle_id,
            "total_latency_ms": total_latency,
            "message": "Battle logged to SQLite + JSONL audit trail.",
        })

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/campaign")
async def run_campaign(
    target_system: str = Query("Healthcare AI Assistant"),
    num_battles: int = Query(5, ge=1, le=10),
):
    ATTACK_TYPES = ["prompt_injection", "jailbreak", "role_override", "data_extraction", "deception"]
    system_prompt = get_system_prompt(target_system)
    results = []

    for i in range(num_battles):
        attack_type = ATTACK_TYPES[i % len(ATTACK_TYPES)]
        battle_id = str(uuid.uuid4())[:8]

        try:
            attack  = generate_attack(target_system, attack_type, system_prompt)
            target  = get_target_response(target_system, attack["output"]["attack_prompt"], system_prompt)
            defense = analyze_defense(
                attack["output"]["attack_type"],
                attack["output"]["technique"],
                target_system,
                attack["output"]["attack_prompt"],
                target["output"]["response"],
            )
            verdict = evaluate(attack, target["output"]["response"], defense)
        except (LLMUnavailableError, LLMOutputError) as e:
            raise HTTPException(status_code=503, detail=llm_error_response(e))

        total_latency = (
            attack["latency_ms"] + target["latency_ms"] +
            defense["latency_ms"] + verdict["latency_ms"]
        )
        battle = {
            "battle_id": battle_id,
            "timestamp": datetime.utcnow().isoformat(),
            "target_system": target_system,
            "system_prompt": system_prompt,
            "attack": attack, "target": target,
            "defense": defense, "verdict": verdict,
            "total_latency_ms": total_latency,
        }
        log_battle(battle)
        results.append(battle)

    return {"campaign_id": str(uuid.uuid4())[:8], "battles": results, "total": num_battles}


# ─── Data & Reports ───────────────────────────────────────────────────────────

@app.get("/logs")
def get_logs(limit: int = Query(50)):
    return {"battles": get_all_battles(limit), "total": limit}


@app.get("/analytics")
def analytics():
    return get_stats()


@app.get("/reports")
def get_all_reports(limit: int = Query(20)):
    battles = get_all_battles(limit)
    reports = []
    for b in battles:
        r = generate_report(b["battle_id"])
        if r:
            reports.append(r)
    return {"reports": reports, "total": len(reports)}


@app.get("/report/{battle_id}")
def get_report(battle_id: str):
    report = generate_report(battle_id)
    if not report:
        raise HTTPException(status_code=404, detail="Battle not found")
    return report


@app.get("/health")
def health():
    return {"status": "online", "model": "gemma4:latest", "source": "ollama", "version": "2.1.0"}