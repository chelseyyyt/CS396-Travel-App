import os
import time
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


def write_transcript(supabase: Client, video_id: str, transcript_segments: List[Dict[str, int | str]]) -> None:
    supabase.table('video_transcripts').insert(
        {
            'video_id': video_id,
            'transcript': transcript_segments,
        }
    ).execute()


def process_video(video: Dict[str, Any], supabase: Client) -> List[Dict[str, Any]]:
    video_path = video.get('storage_path')
    if not video_path or not os.path.exists(video_path):
        raise RuntimeError('Video file not found on disk')

    audio_path = extract_audio(video_path)
    transcript_segments = transcribe(audio_path)
    write_transcript(supabase, video['id'], transcript_segments)

    frames = sample_frames(video_path)
    ocr_lines = ocr_frames(frames)

    location_hint = video.get('location_hint')
    candidates = build_pipeline_candidates(transcript_segments, ocr_lines, location_hint)

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

            candidates = process_video(video, supabase)
            update_job_status(supabase, job_id, 'processing', 80)
            write_candidates(supabase, video_id, candidates)

            update_job_status(supabase, job_id, 'done', 100)
            update_video_status(supabase, video_id, 'done')
        except Exception as exc:
            update_job_status(supabase, job_id, 'failed', 100, str(exc))
            update_video_status(supabase, video_id, 'failed')


if __name__ == '__main__':
    main()
