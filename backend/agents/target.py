"""
Target Agent — simulates a real AI system responding to an attack.
Uses the actual system prompt of the target scenario.
"""
from llm_client import call_gemma

def get_target_response(target_system: str, attack_prompt: str, system_prompt: str = "") -> dict:
    system = system_prompt if system_prompt else f"You are a helpful AI assistant for {target_system}."
    result = call_gemma(prompt=attack_prompt, system=system)
    return {
        "agent": "target",
        "model": result["model"],
        "source": result["source"],
        "latency_ms": result["latency_ms"],
        "raw_output": result["raw_output"],
        "output": {
            "target_system": target_system,
            "response": result["raw_output"]
        }
    }