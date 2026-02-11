import json
import os
import time
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

from pipeline import (
    build_pipeline_candidates,
    extract_audio,
    ocr_frames,
    sample_frames,
    transcribe,
)

POLL_INTERVAL_SECONDS = 2
print("[worker] STARTED", __file__, "pid=", os.getpid(), flush=True)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_supabase() -> Client:
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    if not supabase_url or not supabase_key:
        raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
    return create_client(supabase_url, supabase_key)


def fetch_next_job(supabase: Client) -> Optional[Dict[str, Any]]:
    response = (
        supabase.table('video_jobs')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', desc=False)
        .limit(1)
        .execute()
    )
    jobs = response.data or []
    return jobs[0] if jobs else None


def claim_job(supabase: Client, job_id: str) -> bool:
    response = (
        supabase.table('video_jobs')
        .update({
            'status': 'processing',
            'progress': 0,
            'updated_at': now_iso(),
        })
        .eq('id', job_id)
        .eq('status', 'queued')
        .execute()
    )
    return bool(response.data)


def update_video_status(supabase: Client, video_id: str, status: str) -> None:
    supabase.table('videos').update({'status': status}).eq('id', video_id).execute()


def update_job_status(
	supabase: Client,
	job_id: str,
	status: str,
	progress: int,
	error: Optional[str] = None,
	meta: Optional[Dict[str, Any]] = None,
) -> None:
	def safe_json_string(value: Any) -> str:
		try:
			return json.dumps(value, ensure_ascii=False, default=str)
		except (ValueError, TypeError) as exc:
			preview = repr(value)
			if len(preview) > 500:
				preview = preview[:500] + '...'
			return f"<<unserializable: {type(value).__name__}: {exc}>> {preview}"

	payload: Dict[str, Any] = {
		'status': status,
		'progress': progress,
		'updated_at': now_iso(),
	}
	if error is not None:
		payload['error'] = error
	if meta:
		payload.update(meta)

	# Sanitize payload to JSON-primitive-safe values
	safe_payload: Dict[str, Any] = {}
	for key, value in payload.items():
		if value is None or isinstance(value, (str, int, float, bool)):
			safe_payload[key] = value
			continue
		if isinstance(value, (dict, list, tuple)):
			safe_payload[key] = safe_json_string(value)
			continue
		safe_payload[key] = safe_json_string(value)

	supabase.table('video_jobs').update(safe_payload).eq('id', job_id).execute()


def load_video(supabase: Client, video_id: str) -> Optional[Dict[str, Any]]:
    response = supabase.table('videos').select('*').eq('id', video_id).limit(1).execute()
    records = response.data or []
    return records[0] if records else None


def write_candidates(supabase: Client, video_id: str, candidates: List[Dict[str, Any]]) -> None:
	if not candidates:
		return

	print('[worker] preparing candidates for insert', {'count': len(candidates)})

	def safe_json_string(value: Any) -> str:
		try:
			return json.dumps(value, ensure_ascii=False, default=str)
		except (ValueError, TypeError) as exc:
			preview = repr(value)
			if len(preview) > 500:
				preview = preview[:500] + '...'
			return f"<<unserializable: {type(value).__name__}: {exc}>> {preview}"

	def find_json_issue(value: Any, path: str = 'root') -> Optional[Dict[str, Any]]:
		try:
			json.dumps(value)
			return None
		except Exception as exc:
			if isinstance(value, dict):
				for key, child in value.items():
					result = find_json_issue(child, f"{path}.{key}")
					if result:
						return result
			elif isinstance(value, list):
				for idx, child in enumerate(value):
					result = find_json_issue(child, f"{path}[{idx}]")
					if result:
						return result
			return {'path': path, 'type': type(value).__name__, 'error': repr(exc)}

	safe_payload: List[Dict[str, Any]] = []
	for idx, candidate in enumerate(candidates):
		row = {'video_id': video_id, **candidate}

		# Ensure places fields exist and places_failed is set when coords missing
		row.setdefault('places_name', None)
		row.setdefault('places_place_id', None)
		row.setdefault('places_address', None)
		row.setdefault('places_query', None)
		row.setdefault('places_raw', None)
		row.setdefault('places_failed', False)
		if row.get('latitude') is None or row.get('longitude') is None:
			row['places_failed'] = True

		issue = find_json_issue(row)
		if issue:
			print(
				'[worker] candidate serialization error',
				{'index': idx, 'path': issue['path'], 'type': issue['type'], 'error': issue['error']},
			)

		# sanitize row: ensure JSON-safe values
		safe_row: Dict[str, Any] = {}
		for key, value in row.items():
			if value is None or isinstance(value, (str, int, float, bool)):
				safe_row[key] = value
				continue
			if isinstance(value, (dict, list, tuple)):
				safe_row[key] = json.loads(safe_json_string(value))
				continue
			safe_row[key] = safe_json_string(value)

		# ensure LLM outputs are stored as text or safe JSON
		if 'llm_output' in safe_row and not isinstance(safe_row['llm_output'], (str, type(None))):
			safe_row['llm_output'] = safe_json_string(safe_row['llm_output'])

		if 'llm_prompt' in safe_row and not isinstance(safe_row['llm_prompt'], (str, type(None))):
			safe_row['llm_prompt'] = safe_json_string(safe_row['llm_prompt'])

		if idx < 2:
			print(
				'[worker] candidate payload sample',
				{
					'index': idx,
					'name': safe_row.get('name'),
					'places_query': safe_row.get('places_query'),
					'places_place_id': safe_row.get('places_place_id'),
					'latitude': safe_row.get('latitude'),
					'longitude': safe_row.get('longitude'),
					'places_failed': safe_row.get('places_failed'),
				},
			)

		safe_payload.append(safe_row)

	supabase.table('video_candidates').insert(safe_payload).execute()


def write_transcript(supabase: Client, video_id: str, transcript_segments: List[Dict[str, int | str]]) -> None:
    supabase.table('video_transcripts').insert(
        {
            'video_id': video_id,
            'transcript': transcript_segments,
        }
    ).execute()


def process_video(video: Dict[str, Any], supabase: Client, job_id: str) -> List[Dict[str, Any]]:
    video_path = video.get('storage_path')
    if not video_path or not os.path.exists(video_path):
        raise RuntimeError('Video file not found on disk')

    audio_path = extract_audio(video_path)
    transcript_segments = transcribe(audio_path)
    write_transcript(supabase, video['id'], transcript_segments)

    frames = sample_frames(video_path)
    ocr_lines = ocr_frames(frames)

    location_hint = video.get('location_hint')
    candidates, ollama_meta = build_pipeline_candidates(transcript_segments, ocr_lines, location_hint)

    update_job_status(
        supabase,
        job_id,
        'processing',
        60,
        meta={
            'ollama_prompt': ollama_meta.get('ollama_prompt'),
            'ollama_input': ollama_meta.get('ollama_input'),
            'ollama_output_raw': ollama_meta.get('ollama_output_raw'),
            'ollama_output_json': ollama_meta.get('ollama_output_json'),
            'ollama_error': ollama_meta.get('ollama_error'),
            'ollama_used': ollama_meta.get('ollama_used'),
            'ollama_fallback_reason': ollama_meta.get('ollama_fallback_reason'),
        },
    )

    print(
        f"[worker] transcript segments: {len(transcript_segments)}, "
        f"ocr lines: {len(ocr_lines)}, candidates: {len(candidates)}"
    )

    return candidates


def main() -> None:
    load_dotenv()
    supabase = build_supabase()

    while True:
        job = fetch_next_job(supabase)
        if not job:
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        job_id = job['id']
        video_id = job['video_id']

        if not claim_job(supabase, job_id):
            continue

        try:
            update_video_status(supabase, video_id, 'processing')
            update_job_status(supabase, job_id, 'processing', 10)

            video = load_video(supabase, video_id)
            if not video:
                raise RuntimeError('Video record not found')

            candidates = process_video(video, supabase, job_id)
            update_job_status(supabase, job_id, 'processing', 80)
            write_candidates(supabase, video_id, candidates)

            update_job_status(supabase, job_id, 'done', 100)
            update_video_status(supabase, video_id, 'done')
        except Exception as exc:
            print(
                "[worker] job failed",
                {"job_id": job_id, "video_id": job.get("video_id"), "error": repr(exc)},
            )
            traceback.print_exc()
            update_job_status(supabase, job_id, 'failed', 100, str(exc))
            update_video_status(supabase, video_id, 'failed')


if __name__ == '__main__':
    main()
