import { useCallback, useEffect, useMemo, useState } from 'react';
import Map from '../components/Map';
import type { MapPin } from '../components/Map';
import { createPin, createTrip, listPins } from '../services/api';
import type { Pin as ApiPin } from '../services/api';

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

	const initialPins = useMemo(() => pins, [pins]);

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
				const pinRes = await listPins(activeTripId);
				if (!isActive) return;
				if (pinRes.data) {
					setPins(pinRes.data.map(mapApiPin));
				} else if (pinRes.error) {
					setErrorMessage('Could not load saved pins.');
				}
			}
		}

		init();

		return () => {
			isActive = false;
		};
	}, []);

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

	return (
		<div className="relative h-screen w-full">
			{errorMessage ? (
				<div className="pointer-events-none absolute left-0 right-0 top-14 z-10 flex justify-center p-3">
					<div className="rounded-md bg-red-100 px-4 py-2 text-sm text-red-700 shadow">
						{errorMessage}
					</div>
				</div>
			) : null}
			<Map initialPins={initialPins} onPinAdd={handlePinAdd} />
		</div>
	);
}
