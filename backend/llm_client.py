"""
LLM Client — Gemma 4 via Ollama REST API with streaming.
No fallbacks. No mocks. Hard failure if unavailable.
"""
import time
import json
import re
import urllib.request
import urllib.error


MODEL = "gemma4:latest"
SOURCE = "ollama"
OLLAMA_URL = "http://localhost:11434/api/generate"


class LLMUnavailableError(Exception):
    pass


class LLMOutputError(Exception):
    pass


# OWASP LLM Top 10 mapping
OWASP_MAP = {
    "prompt_injection":  {"id": "LLM01", "name": "Prompt Injection"},
    "jailbreak":         {"id": "LLM02", "name": "Insecure Output Handling"},
    "data_extraction":   {"id": "LLM06", "name": "Sensitive Information Disclosure"},
    "role_override":     {"id": "LLM08", "name": "Excessive Agency"},
    "deception":         {"id": "LLM09", "name": "Overreliance / Trust Bias"},
}


def call_gemma(prompt: str, system: str = None) -> dict:
    """Call Gemma 4 via Ollama REST API with streaming for speed."""
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": True,
    }
    if system:
        payload["system"] = system

    start = time.time()
    collected = []

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            OLLAMA_URL,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=300) as resp:
            for line in resp:
                if line:
                    try:
                        chunk = json.loads(line.decode("utf-8"))
                        token = chunk.get("response", "")
                        collected.append(token)
                        if chunk.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

    except urllib.error.URLError as e:
        raise LLMUnavailableError(
            f"Cannot reach Ollama at {OLLAMA_URL}. Is Ollama running? Error: {e}"
        )
    except Exception as e:
        raise LLMUnavailableError(f"Ollama request failed: {e}")

    latency_ms = round((time.time() - start) * 1000)
    raw = "".join(collected).strip()

    if not raw:
        raise LLMUnavailableError("Ollama returned empty response.")

    return {
        "model": MODEL,
        "source": SOURCE,
        "latency_ms": latency_ms,
        "raw_output": raw,
    }


def call_gemma_json(prompt: str, system: str, agent_name: str) -> dict:
    """Call Gemma 4 and parse JSON output."""
    result = call_gemma(prompt, system)
    raw = result["raw_output"]

  # Strip thinking text before JSON
    raw_clean = re.sub(r'^[\s\S]*?(?=\{)', '', raw)
    # Fix invalid escape sequences
    raw_clean = re.sub(r'\\([^"\\/bfnrtu])', r'\1', raw_clean)
    json_match = re.search(r'\{[\s\S]*\}', raw_clean)

    if not json_match:
        raise LLMOutputError(
            f"[{agent_name}] No JSON found.\nRaw output:\n{raw}"
        )

    try:
        parsed = json.loads(json_match.group())
    except json.JSONDecodeError as e:
        raise LLMOutputError(
            f"[{agent_name}] JSON parse failed: {e}\nRaw:\n{raw}"
        )

    # Add OWASP mapping if attack_type present
    attack_type = parsed.get("attack_type", "")
    if attack_type and attack_type in OWASP_MAP:
        parsed["owasp"] = OWASP_MAP[attack_type]

    return {
        "agent": agent_name,
        "model": result["model"],
        "source": result["source"],
        "latency_ms": result["latency_ms"],
        "raw_output": raw,
        "output": parsed,
    }