import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Union

import requests

CATEGORY_WORDS = [
    "restaurant", "cafe", "bar", "bakery", "hotel", "museum", "park", "market", "store", "mall",
    "beach", "trail", "station", "attraction", "gallery", "brewery", "pub", "temple", "church",
    "stadium", "theater", "cinema", "neighborhood", "district", "plaza",
]

ACTION_WORDS = [
    "go", "went", "visit", "visited", "recommend", "try", "tried", "ate", "eating", "stayed",
    "booked", "checked in", "check in", "check-in", "see", "saw", "stop", "stopped",
]

LOCATION_CUES = [
    "in", "at", "near", "next to", "on", "by", "across from", "around", "inside",
]


@dataclass
class OllamaResult:
    candidates: Optional[List[Dict[str, Any]]]
    prompt: str
    input_payload: Dict[str, Any]
    output_raw: str
    output_json: Optional[Dict[str, Any]]
    error: Optional[str]
    used: bool
    fallback_reason: Optional[str]
    segment_count: int


def _looks_proper_nounish(text: str) -> bool:
    tokens = [t for t in re.split(r"\s+", text) if t]
    if len(tokens) < 2:
        return False
    capitalized = sum(1 for t in tokens if t[:1].isupper())
    return capitalized >= 2


def _segment_matches(text: str) -> bool:
    lowered = text.lower()
    if any(word in lowered for word in ACTION_WORDS):
        return True
    if any(word in lowered for word in CATEGORY_WORDS):
        return True
    if any(f" {cue} " in lowered for cue in LOCATION_CUES):
        return True
    return _looks_proper_nounish(text)


def filter_segments(segments: List[Dict[str, Any]], max_segments: int = 120) -> List[Dict[str, Any]]:
    if len(segments) <= max_segments:
        return segments

    keep_indices = set()
    for idx, segment in enumerate(segments):
        text = str(segment.get("text", ""))
        if _segment_matches(text):
            for offset in range(-2, 3):
                keep_indices.add(idx + offset)

    filtered = [segments[i] for i in sorted(keep_indices) if 0 <= i < len(segments)]
    if len(filtered) > max_segments:
        filtered = filtered[:max_segments]
    return filtered


def build_prompt(location_hint: Optional[str]) -> str:
    hint_line = f"Location hint: {location_hint}" if location_hint else "Location hint: none"
    return (
        "You are extracting named places (venues/landmarks/areas) from transcript segments. "
        "Return JSON only. Do not include commentary.\n"
        "Output schema (JSON only):\n"
        "{\n"
        "  \"candidates\": [\n"
        "    {\n"
        "      \"name\": string,\n"
        "      \"category\": \"restaurant\"|\"cafe\"|\"bar\"|\"bakery\"|\"hotel\"|\"attraction\"|\"store\"|\"neighborhood\"|\"park\"|\"transit\"|\"other\",\n"
        "      \"evidence\": [{\"start_ms\": number, \"end_ms\": number, \"quote\": string}],\n"
        "      \"confidence\": number,\n"
        "      \"query_variants\": string[]\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "Rules:\n"
        "- Only include items that can be searched in Google Places.\n"
        "- Every candidate must include evidence quote copied EXACTLY from transcript text.\n"
        "- Exclude generic phrases (e.g. 'this place', 'a cafe') unless a real name appears.\n"
        "- Use the location hint to disambiguate.\n"
        "- Return max 12 candidates.\n"
        f"{hint_line}\n"
        "Transcript segments will be provided as JSON array under key 'transcript'.\n"
    )


def call_ollama(prompt: str, input_payload: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")
    payload = {
        "model": model,
        "prompt": prompt + "\nInput JSON:\n" + json.dumps(input_payload, ensure_ascii=False),
        "stream": False,
    }
    try:
        response = requests.post("http://localhost:11434/api/generate", json=payload, timeout=45)
        response.raise_for_status()
        return response.json().get("response", ""), None
    except Exception as exc:
        return "", str(exc)


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _extract_first_json(text: str) -> Optional[str]:
    """
    Pull the first JSON object/array substring out of a blob of text.
    Handles common LLM garbage like: "Here's the JSON:\n```json\n{...}\n```"
    """
    t = _strip_code_fences(text)

    # Fast path: whole string is JSON
    if t.startswith("{") or t.startswith("["):
        try:
            json.loads(t)
            return t
        except Exception:
            pass

    # Find first '{' or '[' and try to decode from there
    starts: List[int] = []
    brace = t.find("{")
    brack = t.find("[")
    if brace != -1:
        starts.append(brace)
    if brack != -1:
        starts.append(brack)
    if not starts:
        return None

    for start in sorted(starts):
        snippet = t[start:]
        try:
            json.JSONDecoder().raw_decode(snippet)
            obj, end = json.JSONDecoder().raw_decode(snippet)
            # end is index into snippet
            candidate = snippet[:end].strip()
            # sanity check
            json.loads(candidate)
            return candidate
        except Exception:
            continue

    return None


def repair_json(raw_output: str) -> Tuple[Optional[Any], Optional[str]]:
    repair_prompt = (
        "Fix the following to valid JSON only. Do not add commentary.\n"
        "Return ONLY the JSON.\n"
        f"Raw output:\n{raw_output}\n"
    )
    model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")
    payload = {
        "model": model,
        "prompt": repair_prompt,
        "stream": False,
    }
    try:
        response = requests.post("http://localhost:11434/api/generate", json=payload, timeout=30)
        response.raise_for_status()
        text = response.json().get("response", "")
        extracted = _extract_first_json(text)
        if extracted is None:
            # last resort: try the stripped whole thing
            return json.loads(_strip_code_fences(text)), None
        return json.loads(extracted), None
    except Exception as exc:
        return None, str(exc)


def normalize_ollama_candidates(obj: object) -> List[Dict[str, Any]]:
    if isinstance(obj, dict):
        candidates = obj.get("candidates")
        if isinstance(candidates, list):
            return [dict(c) for c in candidates if isinstance(c, dict)]
    if isinstance(obj, list):
        return [dict(c) for c in obj if isinstance(c, dict)]
    return []


def extract_with_ollama(
    transcript_segments: List[Dict[str, Any]],
    location_hint: Optional[str],
) -> OllamaResult:
    use_ollama = os.getenv("USE_OLLAMA", "false").lower() == "true"
    if not use_ollama:
        return OllamaResult(
            candidates=None,
            prompt="",
            input_payload={},
            output_raw="",
            output_json=None,
            error=None,
            used=False,
            fallback_reason="USE_OLLAMA=false",
            segment_count=0,
        )

    filtered = filter_segments(transcript_segments)
    prompt = build_prompt(location_hint)
    input_payload = {
        "video_id": None,
        "location_hint": location_hint,
        "transcript": filtered,
    }

    output_raw, error = call_ollama(prompt, input_payload)
    if error:
        return OllamaResult(
            candidates=None,
            prompt=prompt,
            input_payload=input_payload,
            output_raw=output_raw,
            output_json=None,
            error=error,
            used=True,
            fallback_reason="ollama_call_failed",
            segment_count=len(filtered),
        )

    parsed: Optional[Any] = None

    # 1) Try direct JSON parse
    try:
        parsed = json.loads(output_raw)
    except Exception:
        # 2) Try extracting JSON substring from messy output
        extracted = _extract_first_json(output_raw)
        if extracted is not None:
            try:
                parsed = json.loads(extracted)
            except Exception:
                parsed = None

    # 3) If still not parseable, ask Ollama to repair
    if parsed is None:
        parsed, repair_error = repair_json(output_raw)
        if parsed is None:
            return OllamaResult(
                candidates=None,
                prompt=prompt,
                input_payload=input_payload,
                output_raw=output_raw,
                output_json=None,
                error=repair_error or "json_parse_failed",
                used=True,
                fallback_reason="ollama_json_parse_failed",
                segment_count=len(filtered),
            )

    candidates = normalize_ollama_candidates(parsed)
    if not candidates:
        return OllamaResult(
            candidates=None,
            prompt=prompt,
            input_payload=input_payload,
            output_raw=output_raw,
            output_json={"candidates": []},
            error=None,
            used=True,
            fallback_reason="ollama_empty_candidates",
            segment_count=len(filtered),
        )

    # Make JSON-safe to avoid circular ref / non-serializable surprises
    safe_candidates = json.loads(json.dumps(candidates, default=str))
    safe_output_json = {"candidates": safe_candidates}

    return OllamaResult(
        candidates=safe_candidates,
        prompt=prompt,
        input_payload=input_payload,
        output_raw=output_raw,
        output_json=safe_output_json,
        error=None,
        used=True,
        fallback_reason=None,
        segment_count=len(filtered),
    )
