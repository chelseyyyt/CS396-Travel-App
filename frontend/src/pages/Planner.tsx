import { useCallback, useEffect, useMemo, useState } from 'react';
import GoogleMap from '../components/Map';
import type { MapPin } from '../components/Map';
import {
	approveVideoCandidates,
	createPin,
	createTrip,
	deletePin,
	getVideo,
	getVideoDebug,
	listPins,
	addCandidatesToTrip,
	uploadTripVideo,
} from '../services/api';
import type { Pin as ApiPin, VideoCandidate, VideoJob } from '../services/api';

const TRIP_ID_KEY = 'travelapp_trip_id';
const USER_ID_KEY = 'travelapp_user_id';
const VIDEO_LOCATION_HINT_KEY = 'travelapp_last_video_location_hint';

function createLocalId() {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapApiPin(pin: ApiPin): MapPin {
	return {
		id: pin.id,
		tripId: pin.trip_id,
		name: pin.name,
		latitude: pin.latitude,
		longitude: pin.longitude,
		placeId: pin.place_id || undefined,
		notes: pin.notes || undefined,
	};
}

export default function Planner() {
	const [tripId, setTripId] = useState<string | null>(null);
	const [pins, setPins] = useState<MapPin[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [videoId, setVideoId] = useState<string | null>(null);
	const [videoJob, setVideoJob] = useState<VideoJob | null>(null);
	const [videoCandidates, setVideoCandidates] = useState<VideoCandidate[]>([]);
	const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
	const [hasAutoSelected, setHasAutoSelected] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [locationHint, setLocationHint] = useState('');
	const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
	const [showDebug, setShowDebug] = useState(false);
	const [debugData, setDebugData] = useState<{
		video: { id: string } | null;
		job: VideoJob | null;
		candidates: VideoCandidate[];
		transcript: Array<{ start_ms?: number; end_ms?: number; text?: string }> | null;
		transcript_segment_count: number;
		transcript_text: string;
	} | null>(null);
	const [debugLoading, setDebugLoading] = useState(false);
	const [transcriptExpanded, setTranscriptExpanded] = useState(false);
	const [showTranscriptJson, setShowTranscriptJson] = useState(false);

	const initialPins = useMemo(() => pins, [pins]);

	const refreshPins = useCallback(async (activeTripId: string) => {
		const pinRes = await listPins(activeTripId);
		if (pinRes.data) {
			setPins(pinRes.data.map(mapApiPin));
		} else if (pinRes.error) {
			setErrorMessage('Could not load saved pins.');
		}
	}, []);

	useEffect(() => {
		let isActive = true;

		async function init() {
			setErrorMessage(null);
			let activeTripId = localStorage.getItem(TRIP_ID_KEY);
			if (!activeTripId) {
				let userId = localStorage.getItem(USER_ID_KEY);
				if (!userId) {
					userId = createLocalId();
					localStorage.setItem(USER_ID_KEY, userId);
				}
				const tripRes = await createTrip({
					user_id: userId,
					title: 'Default Trip',
					description: '',
				});
				if (tripRes.data?.id) {
					activeTripId = tripRes.data.id;
					localStorage.setItem(TRIP_ID_KEY, activeTripId);
				} else {
					setErrorMessage('Could not create a default trip. Pins will not be persisted.');
				}
			}

			if (!isActive) return;
			if (activeTripId) {
				setTripId(activeTripId);
				await refreshPins(activeTripId);
			}
		}

		init();

		return () => {
			isActive = false;
		};
	}, [refreshPins]);

	useEffect(() => {
		const storedHint = localStorage.getItem(VIDEO_LOCATION_HINT_KEY);
		if (storedHint) {
			setLocationHint(storedHint);
		}
	}, []);

	useEffect(() => {
		if (!videoId) return;

		let isActive = true;
		let interval: ReturnType<typeof setInterval> | null = null;

		const poll = async () => {
			const res = await getVideo(videoId);
			if (!isActive) return;
			if (res.data) {
				setVideoJob(res.data.job);
				setVideoCandidates(res.data.candidates);
				const status = res.data.job?.status;
				if (status === 'done' || status === 'failed') {
					if (interval) clearInterval(interval);
				}
			} else if (res.error) {
				setErrorMessage('Could not load video job status.');
			}
		};

		void poll();
		interval = setInterval(poll, 2000);

		return () => {
			isActive = false;
			if (interval) clearInterval(interval);
		};
	}, [videoId]);

	useEffect(() => {
		if (hasAutoSelected || videoCandidates.length === 0) return;
		const selectable = videoCandidates
			.filter(candidate => candidate.latitude != null && candidate.longitude != null)
			.map(candidate => candidate.id);
		setSelectedCandidates(new Set(selectable));
		setHasAutoSelected(true);
	}, [hasAutoSelected, videoCandidates]);

	const handlePinAdd = useCallback(
		async (pin: MapPin) => {
			if (!tripId) {
				setErrorMessage('Trip is not ready yet. Please refresh and try again.');
				return undefined;
			}

			const res = await createPin(tripId, {
				name: pin.name,
				latitude: pin.latitude,
				longitude: pin.longitude,
				placeId: pin.placeId,
				notes: pin.notes,
			});

			if (res.data) {
				const savedPin = { ...mapApiPin(res.data), clientId: pin.clientId };
				setPins(prev => (prev.some(existing => existing.id === savedPin.id) ? prev : [...prev, savedPin]));
				return savedPin;
			}

			setErrorMessage('Could not save pin. Please try again.');
			return undefined;
		},
		[tripId]
	);

	const handleVideoUpload = useCallback(async () => {
		if (!tripId) {
			setErrorMessage('Trip is not ready yet. Please refresh and try again.');
			return;
		}
		if (!selectedFile) {
			setErrorMessage('Please choose a video file first.');
			return;
		}

		setIsUploading(true);
		setErrorMessage(null);
		setVideoJob(null);
		setVideoCandidates([]);
		setSelectedCandidates(new Set());
		setHasAutoSelected(false);

		const res = await uploadTripVideo(tripId, selectedFile, locationHint);
		if (res.data?.videoId) {
			setVideoId(res.data.videoId);
		} else {
			setErrorMessage('Could not upload video. Please try again.');
		}
		setIsUploading(false);
	}, [locationHint, selectedFile, tripId]);

	const handleLocationHintChange = useCallback((value: string) => {
		setLocationHint(value);
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			localStorage.setItem(VIDEO_LOCATION_HINT_KEY, trimmed);
		} else {
			localStorage.removeItem(VIDEO_LOCATION_HINT_KEY);
		}
	}, []);

	const toggleCandidate = useCallback((candidateId: string) => {
		setSelectedCandidates(prev => {
			const next = new Set(prev);
			if (next.has(candidateId)) {
				next.delete(candidateId);
			} else {
				next.add(candidateId);
			}
			return next;
		});
	}, []);

	const handleApproveCandidates = useCallback(async () => {
		if (!videoId || !tripId) return;
		const ids = Array.from(selectedCandidates);
		if (ids.length === 0) return;
		console.log('[planner] add selected', { tripId, candidateIds: ids });

		const res = await addCandidatesToTrip(tripId, ids);
		if (res.data) {
			await refreshPins(tripId);
		} else {
			console.error('[planner] add selected failed', {
				tripId,
				candidateIds: ids,
				error: res.error,
			});
			const message =
				typeof res.error === 'string'
					? res.error
					: 'Could not add pins from video candidates.';
			setErrorMessage(message);
		}
	}, [refreshPins, selectedCandidates, tripId, videoId]);

	const handlePinDelete = useCallback(async (pinId: string) => {
		const res = await deletePin(pinId);
		if (res.data) {
			setPins(prev => prev.filter(pin => pin.id !== pinId));
		} else {
			setErrorMessage('Could not delete pin.');
		}
	}, []);

	const handleShowDebug = useCallback(async () => {
		if (!videoId) return;
		setShowDebug(prev => !prev);
		if (showDebug) return;
		setDebugLoading(true);
		const res = await getVideoDebug(videoId);
		if (res.data) {
			setDebugData(res.data);
			// Temporary visibility check
			console.log('[video-debug]', Object.keys(res.data), res.data.transcript?.length ?? 0);
		} else {
			setErrorMessage('Could not load debug data.');
		}
		setDebugLoading(false);
	}, [showDebug, videoId]);

	const handleCopyTranscript = useCallback(() => {
		if (!debugData?.transcript_text) return;
		void navigator.clipboard.writeText(debugData.transcript_text);
	}, [debugData]);

	const parsePinMeta = useCallback((pin: MapPin) => {
		if (!pin.notes) return { source: 'manual', address: null };
		const [prefix, address] = pin.notes.split(' — ');
		const source = prefix?.includes('from video') ? 'video' : 'manual';
		return { source, address: address ?? null };
	}, []);

	return (
		<div className="relative h-screen w-full">
			{errorMessage ? (
				<div className="pointer-events-none absolute left-0 right-0 top-14 z-10 flex justify-center p-3">
					<div className="rounded-md bg-red-100 px-4 py-2 text-sm text-red-700 shadow">
						{errorMessage}
					</div>
				</div>
			) : null}
			<div className="absolute left-4 top-20 z-20 w-72 max-w-[90vw] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold text-slate-900">Pins</h3>
					<span className="text-xs text-slate-500">{pins.length}</span>
				</div>
				<div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
					{pins.length === 0 ? (
						<p className="text-xs text-slate-400">No pins yet.</p>
					) : (
						pins.map(pin => {
							const meta = parsePinMeta(pin);
							return (
								<div
									key={pin.id ?? pin.clientId}
									className="flex items-start justify-between gap-2 rounded-md border border-slate-100 bg-white px-2 py-2 text-xs text-slate-700"
								>
									<button
										type="button"
										className="flex-1 text-left"
										onClick={() => pin.id && setSelectedPinId(pin.id)}
									>
										<div className="font-semibold text-slate-900">{pin.name ?? 'Dropped Pin'}</div>
										{meta.address ? (
											<div className="text-[11px] text-slate-500">{meta.address}</div>
										) : null}
										<span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
											{meta.source}
										</span>
									</button>
									{pin.id ? (
										<button
											type="button"
											onClick={() => handlePinDelete(pin.id!)}
											className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700"
										>
											Delete
										</button>
									) : null}
								</div>
							);
						})
					)}
				</div>
			</div>
			<div className="absolute right-4 top-20 z-20 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
				<h3 className="text-sm font-semibold text-slate-900">Video → Place Candidates</h3>
				<p className="mt-1 text-xs text-slate-500">Upload a short clip and review extracted places.</p>
				<div className="mt-3 flex flex-col gap-2">
					<div>
						<label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
							Video location (optional)
						</label>
						<input
							type="text"
							value={locationHint}
							onChange={event => handleLocationHintChange(event.target.value)}
							placeholder="e.g., Chicago, IL"
							className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
						/>
					</div>
					<input
						type="file"
						accept="video/*"
						onChange={event => setSelectedFile(event.target.files?.[0] ?? null)}
						className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
					/>
					<button
						type="button"
						onClick={handleVideoUpload}
						disabled={isUploading}
						className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
					>
						{isUploading ? 'Uploading…' : 'Upload Video'}
					</button>
				</div>
				{locationHint.trim().length === 0 ? (
					<p className="mt-2 text-[11px] text-amber-600">
						Tip: add a city (e.g., Chicago) to improve accuracy.
					</p>
				) : null}
				<div className="mt-3 text-xs text-slate-600">
					Status:{' '}
					<span className="font-medium text-slate-900">
						{videoJob?.status ?? (videoId ? 'queued' : 'idle')}
					</span>
					{videoJob?.progress != null ? ` (${videoJob.progress}%)` : ''}
					{videoJob?.error ? ` - ${videoJob.error}` : ''}
				</div>
				{videoCandidates.length > 0 ? (
					<div className="mt-3 space-y-2">
						<p className="text-xs font-semibold text-slate-700">Candidates</p>
						<div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
							{videoCandidates.map(candidate => (
								<label
									key={candidate.id}
									className="flex items-start gap-2 text-xs text-slate-700"
								>
									<input
										type="checkbox"
										checked={selectedCandidates.has(candidate.id)}
										onChange={() => toggleCandidate(candidate.id)}
										disabled={candidate.latitude == null || candidate.longitude == null}
										className="mt-0.5"
									/>
									<span>
										<span className="font-medium text-slate-900">{candidate.name}</span>
										{candidate.address_hint ? ` · ${candidate.address_hint}` : ''}
										<span className="ml-1 text-[10px] text-slate-400">
											{Math.round(candidate.confidence * 100)}%
										</span>
										{candidate.latitude == null || candidate.longitude == null ? (
											<span className="ml-2 text-[10px] text-amber-500">No coordinates</span>
										) : null}
									</span>
								</label>
							))}
						</div>
						<button
							type="button"
							onClick={handleApproveCandidates}
							disabled={selectedCandidates.size === 0 || videoJob?.status !== 'done'}
							className="w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
						>
							Add selected to map
						</button>
					</div>
				) : (
					<p className="mt-3 text-xs text-slate-400">Candidates will appear here once processing completes.</p>
				)}
				<div className="mt-3">
					<button
						type="button"
						onClick={handleShowDebug}
						disabled={!videoId}
						className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
					>
						{showDebug ? 'Hide Video Debug' : 'Show Video Debug'}
					</button>
					{showDebug ? (
						<div className="mt-2 rounded-md border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-600">
							{debugLoading ? (
								<p>Loading debug data…</p>
							) : debugData ? (
								<div className="space-y-2">
									<div>
										<p className="font-semibold text-slate-700">Transcript preview</p>
										<p className="line-clamp-4">
											{debugData.candidates
												.flatMap(candidate => (candidate.source?.transcript_snippets as { text: string }[] | undefined) ?? [])
												.slice(0, 4)
												.map(snippet => snippet.text)
												.join(' ')}
										</p>
									</div>
									{debugData.transcript ? (
										<div>
											<div className="flex items-center justify-between">
												<p className="font-semibold text-slate-700">
													Transcript ({debugData.transcript_segment_count} segments)
												</p>
												<div className="flex items-center gap-2">
													<button
														type="button"
														onClick={() => setTranscriptExpanded(prev => !prev)}
														className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
													>
														{transcriptExpanded ? 'Collapse' : 'Expand'}
													</button>
													<button
														type="button"
														onClick={() => setShowTranscriptJson(prev => !prev)}
														className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
													>
														{showTranscriptJson ? 'Hide JSON' : 'Raw JSON'}
													</button>
													<button
														type="button"
														onClick={handleCopyTranscript}
														className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
													>
														Copy transcript
													</button>
												</div>
											</div>
											{transcriptExpanded ? (
												<pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md bg-white p-2 text-[11px] text-slate-600">
													{debugData.transcript
														.map(segment => {
															const start = segment.start_ms ?? 0;
															const end = segment.end_ms ?? 0;
															const text = segment.text ?? '';
															return `[${start}-${end}] ${text}`.trim();
														})
														.join('\n')}
												</pre>
											) : null}
											{showTranscriptJson ? (
												<pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md bg-white p-2 text-[11px] text-slate-600">
													{JSON.stringify(debugData.transcript, null, 2)}
												</pre>
											) : null}
										</div>
									) : null}
									<div>
										<p className="font-semibold text-slate-700">OCR preview</p>
										<p className="line-clamp-4">
											{debugData.candidates
												.flatMap(candidate => (candidate.source?.ocr_snippets as { text: string }[] | undefined) ?? [])
												.slice(0, 6)
												.map(snippet => snippet.text)
												.join(' · ')}
										</p>
									</div>
									<div>
										<p className="font-semibold text-slate-700">Candidates</p>
										{debugData.candidates.map(candidate => (
											<div key={candidate.id} className="mt-2 rounded-md border border-slate-200 bg-white p-2">
												<p className="font-semibold text-slate-800">{candidate.name}</p>
												<p>Places query: {candidate.places_query ?? 'n/a'}</p>
												<p>
													Places result: {candidate.places_name ?? 'n/a'}{' '}
													{candidate.places_address ? `· ${candidate.places_address}` : ''}
												</p>
												<p>Extraction: {candidate.extraction_method ?? 'n/a'}</p>
												{candidate.llm_prompt ? (
													<details className="mt-2">
														<summary className="cursor-pointer text-[11px] font-medium text-slate-600">
															Ollama prompt
														</summary>
														<pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
															{candidate.llm_prompt}
														</pre>
													</details>
												) : null}
												{candidate.llm_output ? (
													<details className="mt-2">
														<summary className="cursor-pointer text-[11px] font-medium text-slate-600">
															Ollama output
														</summary>
														<pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
															{JSON.stringify(candidate.llm_output, null, 2)}
														</pre>
													</details>
												) : null}
											</div>
										))}
									</div>
									{debugData.job ? (
										<div className="rounded-md border border-slate-200 bg-white p-2">
											<p className="font-semibold text-slate-700">Ollama run</p>
											<p>Used: {String(debugData.job.ollama_used)}</p>
											<p>Fallback: {debugData.job.ollama_fallback_reason ?? 'none'}</p>
											<p>Error: {debugData.job.ollama_error ?? 'none'}</p>
											<details className="mt-2">
												<summary className="cursor-pointer text-[11px] font-medium text-slate-600">
													Ollama prompt
												</summary>
												<pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
													{debugData.job.ollama_prompt ?? ''}
												</pre>
											</details>
											<details className="mt-2">
												<summary className="cursor-pointer text-[11px] font-medium text-slate-600">
													Ollama output raw
												</summary>
												<pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
													{debugData.job.ollama_output_raw ?? ''}
												</pre>
											</details>
											{debugData.job.ollama_output_json ? (
												<details className="mt-2">
													<summary className="cursor-pointer text-[11px] font-medium text-slate-600">
														Ollama output JSON
													</summary>
													<pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
														{JSON.stringify(debugData.job.ollama_output_json, null, 2)}
													</pre>
												</details>
											) : null}
										</div>
									) : null}
								</div>
							) : (
								<p>No debug data yet.</p>
							)}
						</div>
					) : null}
				</div>
			</div>
			<GoogleMap
				initialPins={initialPins}
				pins={pins}
				selectedPinId={selectedPinId}
				onPinAdd={handlePinAdd}
				onPinDelete={handlePinDelete}
			/>
		</div>
	);
}
