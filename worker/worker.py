import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

POLL_INTERVAL_SECONDS = 2


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
) -> None:
    payload: Dict[str, Any] = {
        'status': status,
        'progress': progress,
        'updated_at': now_iso(),
    }
    if error is not None:
        payload['error'] = error
    supabase.table('video_jobs').update(payload).eq('id', job_id).execute()


def load_video(supabase: Client, video_id: str) -> Optional[Dict[str, Any]]:
    response = supabase.table('videos').select('*').eq('id', video_id).limit(1).execute()
    records = response.data or []
    return records[0] if records else None


def write_candidates(supabase: Client, video_id: str, candidates: List[Dict[str, Any]]) -> None:
    if not candidates:
        return
    payload = [
        {
            'video_id': video_id,
            **candidate,
        }
        for candidate in candidates
    ]
    supabase.table('video_candidates').insert(payload).execute()


def process_video(video: Dict[str, Any], uploads_dir: str) -> List[Dict[str, Any]]:
    _ = uploads_dir
    _ = video.get('storage_path')

    transcript = 'Example transcript mentioning a cafe, ramen shop, and market.'
    ocr_text = ['Example Cafe', 'Example Ramen', 'Example Market']

    candidates = [
        {
            'name': 'Example Cafe',
            'address_hint': 'Downtown',
            'latitude': 37.775,
            'longitude': -122.419,
            'confidence': 0.82,
            'start_ms': 1200,
            'end_ms': 6400,
            'source': {
                'transcript': transcript,
                'ocr': ocr_text[0],
            },
        },
        {
            'name': 'Example Ramen',
            'address_hint': 'Market St',
            'latitude': 37.781,
            'longitude': -122.412,
            'confidence': 0.77,
            'start_ms': 7000,
            'end_ms': 12300,
            'source': {
                'transcript': transcript,
                'ocr': ocr_text[1],
            },
        },
        {
            'name': 'Example Market',
            'address_hint': 'Waterfront',
            'latitude': 37.806,
            'longitude': -122.419,
            'confidence': 0.69,
            'start_ms': 13000,
            'end_ms': 19500,
            'source': {
                'transcript': transcript,
                'ocr': ocr_text[2],
            },
        },
    ]

    return candidates


def main() -> None:
    load_dotenv()
    uploads_dir = os.getenv('UPLOADS_DIR', os.path.abspath(os.path.join(os.getcwd(), '..', 'backend', 'uploads')))
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

            candidates = process_video(video, uploads_dir)
            write_candidates(supabase, video_id, candidates)

            update_job_status(supabase, job_id, 'done', 100)
            update_video_status(supabase, video_id, 'done')
        except Exception as exc:
            update_job_status(supabase, job_id, 'failed', 100, str(exc))
            update_video_status(supabase, video_id, 'failed')


if __name__ == '__main__':
    main()
