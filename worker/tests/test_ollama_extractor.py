import json
import os
from pathlib import Path

from ollama_extractor import extract_with_ollama, filter_segments, normalize_ollama_candidates
from pipeline import build_pipeline_candidates


def test_filter_segments_reduces_and_keeps_relevant() -> None:
    fixture_path = Path(__file__).resolve().parents[1] / 'fixtures' / 'transcript_sample.json'
    transcript = json.loads(fixture_path.read_text())

    filtered = filter_segments(transcript, max_segments=3)
    assert len(filtered) <= 3
    assert any('Art Institute' in seg['text'] for seg in filtered)


def test_ollama_disabled_fallback() -> None:
    os.environ['USE_OLLAMA'] = 'false'
    fixture_path = Path(__file__).resolve().parents[1] / 'fixtures' / 'transcript_sample.json'
    transcript = json.loads(fixture_path.read_text())
    result = extract_with_ollama(transcript, None)

    assert result.used is False
    assert result.fallback_reason == 'USE_OLLAMA=false'
    assert result.segment_count == 0


def test_pipeline_candidates_json_serializable() -> None:
    os.environ['USE_OLLAMA'] = 'false'
    fixture_path = Path(__file__).resolve().parents[1] / 'fixtures' / 'transcript_sample.json'
    transcript = json.loads(fixture_path.read_text())
    candidates, meta = build_pipeline_candidates(transcript, [], None)

    json.dumps(meta)
    for candidate in candidates:
        json.dumps(candidate)


def test_normalize_dict_candidates() -> None:
    obj = {'candidates': [{"name": "Daisy's"}, {'name': 'Cafe'}]}
    candidates = normalize_ollama_candidates(obj)
    assert len(candidates) == 2
    assert candidates[0]['name'] == "Daisy's"


def test_normalize_list_candidates() -> None:
    obj = [{"name": "Daisy's"}]
    candidates = normalize_ollama_candidates(obj)
    assert len(candidates) == 1
    assert candidates[0]['name'] == "Daisy's"


def test_list_output_success() -> None:
    # Simulate list-only output by calling normalize directly
    candidates = normalize_ollama_candidates(
        [{"name": "Daisy's", "category": "cafe", "evidence": [], "confidence": 1}]
    )
    assert candidates
