import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from faster_whisper import WhisperModel
from paddleocr import PaddleOCR


def extract_audio(video_path: str) -> str:
    audio_path = Path(tempfile.mkdtemp(prefix='video_audio_')) / 'audio.wav'
    cmd = [
        'ffmpeg',
        '-y',
        '-i',
        video_path,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        str(audio_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return str(audio_path)


def transcribe(audio_path: str) -> List[Dict[str, int | str]]:
    model_name = os.getenv('WHISPER_MODEL', 'base')
    model = WhisperModel(model_name, compute_type='int8')
    segments, _info = model.transcribe(audio_path, beam_size=5, vad_filter=True)
    results: List[Dict[str, int | str]] = []
    for segment in segments:
        results.append(
            {
                'start_ms': int(segment.start * 1000),
                'end_ms': int(segment.end * 1000),
                'text': segment.text.strip(),
            }
        )
    return results


def sample_frames(video_path: str) -> List[Dict[str, int | str]]:
    frames_dir = Path(tempfile.mkdtemp(prefix='video_frames_'))
    output_pattern = str(frames_dir / 'frame_%06d.jpg')
    cmd = [
        'ffmpeg',
        '-y',
        '-i',
        video_path,
        '-vf',
        'fps=1',
        '-q:v',
        '2',
        output_pattern,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    frames = sorted(frames_dir.glob('frame_*.jpg'))
    results: List[Dict[str, int | str]] = []
    for frame in frames:
        match = re.search(r'frame_(\d+)\.jpg', frame.name)
        if not match:
            continue
        index = int(match.group(1))
        timestamp_ms = max(index - 1, 0) * 1000
        results.append({'timestamp_ms': timestamp_ms, 'frame_path': str(frame)})
    return results


def ocr_frames(frames: Iterable[Dict[str, int | str]]) -> List[Dict[str, int | str]]:
    ocr = PaddleOCR(use_angle_cls=True, lang=os.getenv('OCR_LANG', 'en'))
    results: List[Dict[str, int | str]] = []
    for frame in frames:
        frame_path = str(frame['frame_path'])
        timestamp_ms = int(frame['timestamp_ms'])
        try:
            ocr_result = ocr.ocr(frame_path, cls=True)
        except TypeError:
            ocr_result = ocr.ocr(frame_path)
        lines: List[str] = []
        for entry in ocr_result:
            for line in entry:
                if len(line) < 2:
                    continue
                text = line[1][0]
                if text:
                    lines.append(text.strip())
        if lines:
            results.append({'timestamp_ms': timestamp_ms, 'text': ' | '.join(lines)})
    return results


PLACE_KEYWORDS = [
    'cafe', 'coffee', 'ramen', 'restaurant', 'bar', 'bistro', 'diner', 'grill', 'market',
    'bakery', 'pizza', 'taco', 'sushi', 'bbq', 'pub', 'tavern', 'tea', 'noodle', 'burger',
    'kitchen', 'izakaya', 'food', 'eatery', 'steak', 'pho', 'gelato', 'dessert', 'brew',
]
GENERIC_WORDS = {
    'today', 'tomorrow', 'yesterday', 'subscribe', 'follow', 'like', 'comment', 'share',
    'welcome', 'hello', 'thanks', 'thank you', 'video', 'travel', 'trip', 'food', 'menu',
}


def normalize_text(text: str) -> str:
    cleaned = re.sub(r'[^A-Za-z0-9\s&@\-\'\.]', ' ', text)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def looks_like_place_name(text: str) -> bool:
    if not text or len(text) < 3 or len(text) > 80:
        return False
    lowered = text.lower()
    if lowered in GENERIC_WORDS:
        return False
    if any(keyword in lowered for keyword in PLACE_KEYWORDS):
        return True
    if sum(1 for c in text if c.isupper()) >= 2:
        return True
    if text.istitle():
        return True
    return False


def extract_place_mentions(text: str) -> List[str]:
    patterns = [
        r"we(?:'re| are) at ([A-Za-z0-9&@\-\'\.\s]+)",
        r"we(?:'re| are) in ([A-Za-z0-9&@\-\'\.\s]+)",
        r"go to ([A-Za-z0-9&@\-\'\.\s]+)",
        r"going to ([A-Za-z0-9&@\-\'\.\s]+)",
        r"next stop is ([A-Za-z0-9&@\-\'\.\s]+)",
        r"this is ([A-Za-z0-9&@\-\'\.\s]+)",
    ]
    mentions: List[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, text, flags=re.IGNORECASE):
            candidate = normalize_text(match)
            if candidate:
                mentions.append(candidate)
    return mentions


def score_candidate(name: str, evidence: Dict[str, List[Dict[str, int | str]]]) -> Tuple[float, Dict[str, object]]:
    score = 0.2
    breakdown: Dict[str, object] = {'base': 0.2}
    lowered = name.lower()
    if evidence.get('ocr_snippets'):
        score += 0.4
        breakdown['ocr'] = 0.4
    if evidence.get('transcript_snippets'):
        score += 0.3
        breakdown['transcript'] = 0.3
    if any(keyword in lowered for keyword in PLACE_KEYWORDS):
        score += 0.1
        breakdown['keyword'] = 0.1
    if lowered in GENERIC_WORDS:
        score -= 0.4
        breakdown['generic_penalty'] = -0.4
    final_score = max(0.05, min(score, 0.95))
    breakdown['final'] = final_score
    return final_score, breakdown


def build_candidates(
    transcript_segments: List[Dict[str, int | str]],
    ocr_lines: List[Dict[str, int | str]],
    location_hint: Optional[str],
) -> List[Dict[str, object]]:
    candidates: Dict[str, Dict[str, object]] = {}

    for segment in transcript_segments:
        text = normalize_text(str(segment['text']))
        for mention in extract_place_mentions(text):
            key = mention.lower()
            entry = candidates.setdefault(
                key,
                {
                    'name': mention,
                    'transcript_snippets': [],
                    'ocr_snippets': [],
                    'start_ms': segment['start_ms'],
                    'end_ms': segment['end_ms'],
                },
            )
            entry['transcript_snippets'].append(
                {'text': segment['text'], 'start_ms': segment['start_ms'], 'end_ms': segment['end_ms']}
            )

    for line in ocr_lines:
        text = normalize_text(str(line['text']))
        if not looks_like_place_name(text):
            continue
        key = text.lower()
        entry = candidates.setdefault(
            key,
            {
                'name': text,
                'transcript_snippets': [],
                'ocr_snippets': [],
                'start_ms': line['timestamp_ms'],
                'end_ms': line['timestamp_ms'],
            },
        )
        entry['ocr_snippets'].append({'text': line['text'], 'timestamp_ms': line['timestamp_ms']})

    enriched: List[Dict[str, object]] = []
    for _key, entry in candidates.items():
        name = str(entry['name'])
        evidence = {
            'transcript_snippets': entry.get('transcript_snippets', []),
            'ocr_snippets': entry.get('ocr_snippets', []),
        }
        confidence, breakdown = score_candidate(name, evidence)
        evidence['score_breakdown'] = breakdown
        address_hint = location_hint.strip() if location_hint else None
        enriched.append(
            {
                'name': name,
                'address_hint': address_hint,
                'confidence': confidence,
                'start_ms': entry.get('start_ms'),
                'end_ms': entry.get('end_ms'),
                'source': evidence,
                'extraction_method': 'heuristic',
                'llm_prompt': None,
                'llm_output': None,
            }
        )

    enriched.sort(key=lambda item: float(item['confidence']), reverse=True)
    return enriched[:15]


def generate_candidates_with_ollama(
    transcript_segments: List[Dict[str, int | str]],
    ocr_lines: List[Dict[str, int | str]],
    location_hint: Optional[str],
) -> Optional[Tuple[List[Dict[str, object]], str, object]]:
    if os.getenv('USE_OLLAMA', 'false').lower() != 'true':
        return None
    model = os.getenv('OLLAMA_MODEL', 'qwen2.5:7b-instruct')
    prompt = (
        'Extract 3-15 place candidates from this video evidence. '
        'Return JSON array of objects with name, address_hint, confidence, start_ms, end_ms, '
        'source{transcript_snippets,ocr_snippets}. Evidence: '
        + json.dumps(
            {
                'transcript': transcript_segments,
                'ocr': ocr_lines,
                'location_hint': location_hint,
            }
        )
    )
    payload = {
        'model': model,
        'prompt': prompt,
        'stream': False,
    }
    try:
        response = requests.post('http://localhost:11434/api/generate', json=payload, timeout=30)
        response.raise_for_status()
        text = response.json().get('response', '')
        data = json.loads(text)
        if isinstance(data, list):
            return data, prompt, data
    except Exception:
        return None
    return None


def build_pipeline_candidates(
    transcript_segments: List[Dict[str, int | str]],
    ocr_lines: List[Dict[str, int | str]],
    location_hint: Optional[str],
) -> List[Dict[str, object]]:
    llm_payload = generate_candidates_with_ollama(transcript_segments, ocr_lines, location_hint)
    if llm_payload:
        candidates, prompt, output = llm_payload
        hydrated: List[Dict[str, object]] = []
        for candidate in candidates[:15]:
            candidate.setdefault('address_hint', location_hint)
            candidate['extraction_method'] = 'ollama'
            candidate['llm_prompt'] = prompt
            candidate['llm_output'] = output
            hydrated.append(candidate)
        return hydrated
    return build_candidates(transcript_segments, ocr_lines, location_hint)
