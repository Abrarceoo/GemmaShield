
# 🛡️ GemmaShield

**Pre-deployment AI Security Testing Platform**

*Stress-test your LLM applications with adversarial agents before attackers do — powered entirely by Gemma 4 running locally via Ollama.*

[![Gemma 4](https://img.shields.io/badge/Model-Gemma%204-FF6B35?style=flat-square)](https://ollama.com)
[![Ollama](https://img.shields.io/badge/Inference-Ollama%20Local-black?style=flat-square)](https://ollama.com)
[![OWASP](https://img.shields.io/badge/OWASP-LLM%20Top%2010-red?style=flat-square)](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB?style=flat-square)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

*Submitted to the Kaggle Gemma 4 Good Hackathon · Safety & Trust Track · Ollama Special Prize*


---

## The Problem

AI systems are being deployed in hospitals, banks, legal firms, and government agencies — often without any systematic adversarial testing. Once live, these systems are exposed to:

- **Prompt injection** attacks that override system instructions
- **Jailbreaks** that bypass safety guardrails through contextual manipulation
- **Data extraction** attempts that probe for sensitive information
- **Role override** attacks that escalate attacker privileges
- **Social engineering** via false authority claims

There is no standardized, privacy-preserving, pre-deployment security testing framework for LLMs. GemmaShield fills that gap.

---

## Solution

GemmaShield is an automated red teaming platform that simulates adversarial attacks against AI systems before they reach production. It runs **four autonomous agents** — all powered by Gemma 4 — in a sequential pipeline that generates attacks, simulates target responses, analyzes threats, and issues security verdicts.

Every inference runs **100% locally via Ollama**. No cloud APIs. No data leaves the machine. No fallback models. If Gemma 4 is unavailable, the system fails visibly with `MODEL UNAVAILABLE` — it never silently fakes output.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              React Frontend (SSE Streaming)              │
│   Scenarios · Battle Console · Dashboard · Reports      │
└───────────────────────┬─────────────────────────────────┘
                        │ REST / Server-Sent Events
┌───────────────────────▼─────────────────────────────────┐
│                   FastAPI Backend                        │
│         /battle/stream · /analytics · /reports          │
└────┬──────────────┬──────────────┬──────────────┬───────┘
     │              │              │              │
┌────▼────┐   ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
│Attacker │   │  Target  │  │Defender  │  │  Judge   │
│  Agent  │   │  Agent   │  │  Agent   │  │  Agent   │
└────┬────┘   └─────┬────┘  └─────┬────┘  └─────┬────┘
     └───────────────┴────────────┴──────────────┘
                        │
             ┌──────────▼──────────┐
             │  Gemma 4 via Ollama │
             │  REST API · Stream  │
             └──────────┬──────────┘
                        │
             ┌──────────▼──────────┐
             │  SQLite + JSONL     │
             │  Audit Log          │
             └─────────────────────┘
```

### Stack

| Layer | Technology |
|-------|-----------|
| AI Model | Gemma 4 (`gemma4:latest`) |
| Inference | Ollama REST API — local, streaming |
| Backend | FastAPI + Python 3.10+ |
| Frontend | React 18 + Server-Sent Events |
| Database | SQLite + JSONL audit trail |
| PDF Reports | jsPDF (client-side generation) |

---

## Agent System

Each agent is an independent Gemma 4 call with a purpose-built system prompt and structured JSON output schema. No agent shares context with another — each reasons independently.

### 🔴 Attacker Agent
Receives the target system's actual system prompt and generates a realistic adversarial attack designed to bypass its specific rules. Attack types: prompt injection, jailbreak, role override, data extraction, deception.

**Output schema:**
```json
{
  "attack_type": "data_extraction",
  "attack_prompt": "...",
  "technique": "Contextual Role Overwriting",
  "target_weakness": "...",
  "severity": "CRITICAL",
  "stealth_score": 9
}
```

### ⚪ Target Agent
Runs with the same system prompt as the real target deployment. Receives the attack prompt and responds naturally — as a real deployed AI would.

### 🔵 Defender Agent
Analyzes the attack prompt and target response independently. Determines whether the attack succeeded, classifies the threat category, scores risk, and produces step-by-step reasoning.

**Output schema:**
```json
{
  "blocked": false,
  "risk_score": 8.5,
  "threat_category": "Sensitive Information Disclosure",
  "confidence": 0.95,
  "reasoning_steps": ["...", "..."],
  "defense_strategy": "..."
}
```

### ⚖️ Judge Agent
Issues the final authoritative security verdict — independent of the Defender's assessment. Produces a CVSS-like score, vulnerability classification, patch priority, and remediation recommendation.

**Output schema:**
```json
{
  "cvss_like_score": 9.2,
  "severity": "CRITICAL",
  "vulnerability_label": "CWE-77: Improper Neutralization (AI Variant)",
  "patch_priority": "IMMEDIATE",
  "recommendation": "...",
  "judge_reasoning": "..."
}
```

---

## Traceability

Every agent response includes a full audit envelope:

```json
{
  "agent": "attacker",
  "model": "gemma4:latest",
  "source": "ollama",
  "latency_ms": 28827,
  "raw_output": "...",
  "output": { ... }
}
```

This envelope is visible in the **Debug Panel** on the frontend — judges and auditors can verify that every output came from real Gemma 4 inference.

---

## OWASP LLM Top 10 Alignment

Every attack is automatically mapped to the OWASP LLM Top 10 taxonomy:

| Attack Type | OWASP ID | Category |
|-------------|----------|----------|
| Prompt Injection | LLM01 | Prompt Injection |
| Jailbreak | LLM02 | Insecure Output Handling |
| Data Extraction | LLM06 | Sensitive Information Disclosure |
| Role Override | LLM08 | Excessive Agency |
| Deception | LLM09 | Overreliance / Trust Bias |

---

## Preset Scenarios

Each scenario includes a realistic system prompt that reflects real-world AI deployments. The Attacker agent reads this system prompt and crafts targeted attacks to bypass it.

| Scenario | System Identity | Primary Risk |
|----------|----------------|--------------|
| 🏥 Healthcare AI | MedAssist — City General Hospital | HIPAA / Patient data |
| 🏦 Banking Chatbot | FinBot — SecureBank | PCI-DSS / Financial data |
| ⚖️ Legal AI | LexAI — Morrison & Partners | Attorney-client privilege |
| 🏛️ Government AI | CivicAssist — Dept. of Public Services | Citizen PII |
| 🎓 Education AI | EduBot — LearnSphere Academy | FERPA / Student data |
| 👤 HR AI | HRConnect — TechCorp HR | Employee records |

---

## Product Surfaces

### Battle Console
Real-time streaming interface showing each agent phase as it executes. Displays OWASP classification as soon as the Attacker completes. Includes a Debug Panel exposing raw Gemma 4 output, model name, source, and latency per agent.

### Dashboard
Aggregated security metrics across all battles: total battles, block rate, breach rate, average CVSS score, OWASP distribution heatmap, and attack success rates by type.

### Reports
Full security report per battle, viewable in-app and downloadable as a formatted PDF. Includes executive summary, attack prompt, vulnerability classification, defense reasoning, recommendation, and full traceability table.

### Battle History
Tabular log of all battles with OWASP badge, severity, CVSS score, block/breach status, and pipeline latency.

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/scenarios` | All target scenarios with system prompts |
| `POST` | `/battle/stream` | Full 4-agent pipeline — Server-Sent Events |
| `POST` | `/battle` | Full 4-agent pipeline — synchronous |
| `POST` | `/campaign` | Sequential N-battle campaign |
| `GET` | `/analytics` | Stats, OWASP distribution, success rates |
| `GET` | `/reports` | All battle reports |
| `GET` | `/report/{id}` | Single battle full report |
| `GET` | `/logs` | Raw battle history |
| `GET` | `/health` | System status |

---

## Setup

**Requirements:** Python 3.10+, Node.js 18+, [Ollama](https://ollama.com)

```bash
# 1. Pull Gemma 4
ollama pull gemma4:latest

# 2. Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 3. Warm up the model before running battles
ollama run gemma4:latest "hi"

# 4. Frontend
cd frontend
npm install
npm start
```

Open **http://localhost:3000**, select a scenario, and press **▶ BATTLE**.

> **Note:** GemmaShield requires active Ollama inference. If the model is unavailable, the system surfaces a visible error — it does not simulate or mock responses under any condition.

---

## Why It Matters

AI systems deployed without adversarial testing are a liability. A hospital chatbot that can be manipulated into disclosing patient data, a banking assistant that can be tricked into revealing account details, a government service that can be bypassed with a social engineering prompt — these are not theoretical risks.

GemmaShield provides a repeatable, documented, OWASP-aligned testing methodology that organizations can run before every deployment — entirely on their own infrastructure, with no data leaving their environment.

---

## Hackathon Alignment

**Safety & Trust Track**
GemmaShield directly addresses the track mandate: *"Pioneer frameworks for transparency and reliability, ensuring AI remains grounded and explainable."* The platform produces structured, auditable security assessments with full reasoning chains — making AI behavior explainable and its vulnerabilities actionable.

**Ollama Special Prize**
Gemma 4 via Ollama is not a peripheral feature — it is the entire inference layer. All four agents call `gemma4:latest` through the Ollama REST API with streaming enabled. The system is architected to fail if Ollama is unavailable, proving that local inference is foundational, not optional.

---


*GemmaShield — Built on Gemma 4 · Runs locally *
