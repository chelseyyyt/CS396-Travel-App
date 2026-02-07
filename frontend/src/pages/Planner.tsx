import { useCallback, useEffect, useMemo, useState } from 'react';
import Map from '../components/Map';
import type { MapPin } from '../components/Map';
import {
	approveVideoCandidates,
	createPin,
	createTrip,
	getVideo,
	listPins,
	uploadTripVideo,
} from '../services/api';
import type { Pin as ApiPin, VideoCandidate, VideoJob } from '../services/api';

const TRIP_ID_KEY = 'travelapp_trip_id';
const USER_ID_KEY = 'travelapp_user_id';

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
		setSelectedCandidates(new Set(videoCandidates.map(candidate => candidate.id)));
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

		const res = await uploadTripVideo(tripId, selectedFile);
		if (res.data?.videoId) {
			setVideoId(res.data.videoId);
		} else {
			setErrorMessage('Could not upload video. Please try again.');
		}
		setIsUploading(false);
	}, [selectedFile, tripId]);

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

		const res = await approveVideoCandidates(videoId, ids);
		if (res.data) {
			await refreshPins(tripId);
		} else {
			setErrorMessage('Could not add pins from video candidates.');
		}
	}, [refreshPins, selectedCandidates, tripId, videoId]);

	return (
		<div className="relative h-screen w-full">
			{errorMessage ? (
				<div className="pointer-events-none absolute left-0 right-0 top-14 z-10 flex justify-center p-3">
					<div className="rounded-md bg-red-100 px-4 py-2 text-sm text-red-700 shadow">
						{errorMessage}
					</div>
				</div>
			) : null}
			<div className="absolute right-4 top-20 z-20 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
				<h3 className="text-sm font-semibold text-slate-900">Video → Place Candidates</h3>
				<p className="mt-1 text-xs text-slate-500">Upload a short clip and review extracted places.</p>
				<div className="mt-3 flex flex-col gap-2">
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
										className="mt-0.5"
									/>
									<span>
										<span className="font-medium text-slate-900">{candidate.name}</span>
										{candidate.address_hint ? ` · ${candidate.address_hint}` : ''}
										<span className="ml-1 text-[10px] text-slate-400">
											{Math.round(candidate.confidence * 100)}%
										</span>
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
			</div>
			<Map initialPins={initialPins} onPinAdd={handlePinAdd} />
		</div>
	);
}
