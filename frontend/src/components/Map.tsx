import React, { useCallback, useEffect, useRef, useState } from 'react';

/// <reference types="@types/google.maps" />

export type MapPin = {
	id?: string;
	tripId?: string;
	latitude: number;
	longitude: number;
	name?: string;
	placeId?: string;
	notes?: string;
	notesText?: string;
	clientId?: string;
};

type MapProps = {
	apiKey?: string;
	initialCenter?: { lat: number; lng: number };
	initialZoom?: number;
	initialPins?: MapPin[];
	pins?: MapPin[];
	selectedPinId?: string | null;
	selectedPinCoords?: { lat: number; lng: number } | null;
	onPinAdd?: (pin: MapPin) => Promise<MapPin | void> | void;
	onPinDelete?: (pinId: string) => void;
	onPinSelect?: (pinId: string) => void;
};

// Type declarations for Google Maps (loaded dynamically)
declare global {
	interface Window {
		google?: {
			maps: {
				Map: new (element: HTMLElement, options?: any) => any;
				Marker: new (options?: any) => any;
				InfoWindow: new (options?: any) => any;
				places: {
					Autocomplete: new (input: HTMLInputElement, options?: any) => any;
				};
				MapMouseEvent: any;
				LatLngLiteral: { lat: number; lng: number };
			};
		};
	}
}

// Loads the Google Maps JavaScript API with specified libraries. Ensures single injection.
async function loadGoogleMaps(apiKey: string, libraries: string[] = ['places']): Promise<void> {
	const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader="true"]');
	if (existingScript && (window as any).google && (window as any).google.maps) {
		return;
	}
	if (existingScript && !((window as any).google && (window as any).google.maps)) {
		await new Promise<void>((resolve, reject) => {
			existingScript.addEventListener('load', () => resolve());
			existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
		});
		return;
	}

	const script = document.createElement('script');
	script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=${encodeURIComponent(libraries.join(','))}`;
	script.async = true;
	script.defer = true;
	script.setAttribute('data-google-maps-loader', 'true');

	await new Promise<void>((resolve, reject) => {
		script.addEventListener('load', () => resolve());
		script.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
		document.head.appendChild(script);
	});
}

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

export const GoogleMap: React.FC<MapProps> = ({
	apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
	initialCenter,
	initialZoom = 12,
	initialPins = [],
	pins: controlledPins,
	selectedPinId,
	selectedPinCoords,
	onPinAdd,
	onPinDelete,
	onPinSelect,
}) => {
	const devLog = useCallback((...args: unknown[]) => {
		if (import.meta.env.DEV) {
			// eslint-disable-next-line no-console
			console.log('[map]', ...args);
		}
	}, []);
	const defaultCenter = initialCenter ?? DEFAULT_CENTER;
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const mapRef = useRef<any>(null);
	const markersRef = useRef<Map<string, { marker: any; pin: MapPin }>>(new Map());
	const hasInitializedRef = useRef(false);
	const addMarkerRef = useRef<((position: { lat: number; lng: number }, meta?: { name?: string; placeId?: string }) => void) | null>(null);

	const [isReady, setIsReady] = useState(false);
	const [pins, setPins] = useState<MapPin[]>([]);

	const createClientId = useCallback(() => {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
		return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}, []);

	const getPinKey = useCallback((pin: MapPin) => {
		return pin.clientId ?? pin.id ?? `${pin.latitude},${pin.longitude},${pin.placeId ?? ''}`;
	}, []);

	const buildMarkerIcon = useCallback((isSelected: boolean) => {
		const fill = isSelected ? '#0f172a' : '#2563eb';
		const svg = `
			<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="${fill}">
				<path d="M12 2c-3.86 0-7 3.14-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
			</svg>
		`;
		return {
			url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
			scaledSize: new window.google.maps.Size(30, 30),
			anchor: new window.google.maps.Point(15, 30),
		};
	}, []);

	const createMarkerForPin = useCallback(
		(pin: MapPin) => {
			if (!mapRef.current || !window.google?.maps) return;
			const key = getPinKey(pin);
			if (markersRef.current.has(key)) return;

			const marker = new window.google.maps.Marker({
				position: { lat: pin.latitude, lng: pin.longitude },
				map: mapRef.current,
				title: pin.name ?? undefined,
				icon: buildMarkerIcon(pin.id === selectedPinId),
				label: pin.name ? { text: pin.name.slice(0, 12), fontSize: '10px', fontWeight: '600' } : undefined,
			});

			marker.addListener('click', () => {
				if (pin.id && onPinSelect) {
					onPinSelect(pin.id);
				}
			});

			markersRef.current.set(key, { marker, pin });
		},
		[buildMarkerIcon, getPinKey, onPinSelect, selectedPinId]
	);

	const syncMarkers = useCallback(
		(nextPins: MapPin[]) => {
			const nextKeys = new Set(nextPins.map(getPinKey));
			markersRef.current.forEach((entry, key) => {
				if (!nextKeys.has(key)) {
					entry.marker.setMap(null);
					markersRef.current.delete(key);
				}
			});

			nextPins.forEach(pin => {
				const key = getPinKey(pin);
				const existing = markersRef.current.get(key);
				if (!existing) {
					createMarkerForPin(pin);
					return;
				}
				existing.pin = pin;
				existing.marker.setPosition({ lat: pin.latitude, lng: pin.longitude });
				existing.marker.setTitle(pin.name ?? '');
				existing.marker.setIcon(buildMarkerIcon(pin.id === selectedPinId));
				if (pin.name) {
					existing.marker.setLabel({ text: pin.name.slice(0, 12), fontSize: '10px', fontWeight: '600' });
				}
			});
		},
		[buildMarkerIcon, createMarkerForPin, getPinKey, selectedPinId]
	);

	const addMarkerForPin = useCallback(
		async (pin: MapPin, notify = true) => {
			if (!mapRef.current || !window.google?.maps) return;
			const key = getPinKey(pin);
			if (markersRef.current.has(key)) return;

			createMarkerForPin(pin);
			setPins(prev => (prev.some(existing => getPinKey(existing) === key) ? prev : [...prev, pin]));

			if (notify && onPinAdd) {
				const savedPin = await onPinAdd(pin);
				if (savedPin?.id) {
					setPins(prev =>
						prev.map(existing =>
							existing.clientId && existing.clientId === pin.clientId
								? { ...savedPin, clientId: existing.clientId }
								: existing
						)
					)
				}
			}
		},
		[createMarkerForPin, getPinKey, onPinAdd]
	);

	const addMarker = useCallback(
		(position: { lat: number; lng: number }, meta?: { name?: string; placeId?: string }) => {
			const newPin: MapPin = {
				latitude: position.lat,
				longitude: position.lng,
				name: meta?.name,
				placeId: meta?.placeId,
				clientId: createClientId(),
			};
			void addMarkerForPin(newPin, true);
		},
		[addMarkerForPin, createClientId]
	);

	useEffect(() => {
		// Assign in effect to avoid TDZ issues with const function definitions.
		addMarkerRef.current = addMarker;
	}, [addMarker]);

	useEffect(() => {
		if (!isReady || initialPins.length === 0) return;
		initialPins.forEach(pin => {
			void addMarkerForPin(pin, false);
		});
	}, [addMarkerForPin, initialPins, isReady]);

	useEffect(() => {
		if (!isReady) return;
		if (!mapRef.current) {
			devLog('skip marker sync: map not ready');
			return;
		}
		const nextPins = controlledPins ?? pins;
		syncMarkers(nextPins);
	}, [controlledPins, isReady, pins, syncMarkers]);

	useEffect(() => {
		if (controlledPins) {
			setPins(controlledPins);
		}
	}, [controlledPins]);

	useEffect(() => {
		if (!mapRef.current) return;
		if (selectedPinCoords) {
			const lat = Number(selectedPinCoords.lat);
			const lng = Number(selectedPinCoords.lng);
			if (Number.isFinite(lat) && Number.isFinite(lng)) {
				devLog('pan to selected pin coords', { lat, lng });
				mapRef.current.panTo({ lat, lng });
				mapRef.current.setZoom(15);
			} else {
				devLog('skip pan: selectedPinCoords invalid', selectedPinCoords);
			}
			return;
		}
		if (!selectedPinId) return;
		const mergedPins = [...(controlledPins ?? []), ...pins];
		const selectedPin = mergedPins.find(pin => pin.id === selectedPinId);
		if (!selectedPin) return;
		if (
			selectedPin.latitude == null ||
			selectedPin.longitude == null ||
			selectedPin.latitude === '' ||
			selectedPin.longitude === ''
		) {
			devLog('selected pin missing coords', selectedPin);
			return;
		}
		const lat = Number(selectedPin.latitude);
		const lng = Number(selectedPin.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
			devLog('selected pin invalid coords', { lat, lng, selectedPin });
			return;
		}
		devLog('pan to selected pin', { id: selectedPinId, lat, lng });
		mapRef.current.panTo({ lat, lng });
		mapRef.current.setZoom(15);
	}, [controlledPins, devLog, pins, selectedPinCoords, selectedPinId]);

	useEffect(() => {
		let mapClickListener: any = null;

		async function init() {
			if (hasInitializedRef.current) return;
			if (!apiKey) return;
			try {
				await loadGoogleMaps(apiKey, ['places']);
				if (!mapContainerRef.current || !window.google?.maps) return;
				const center = defaultCenter;
				mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
					center,
					zoom: initialZoom,
					mapTypeControl: false,
					streetViewControl: false,
					fullscreenControl: false,
				});
				if (!mapRef.current) {
					devLog('map init warning: mapRef.current is null after init');
					return;
				}

				// Click to drop a marker
				mapClickListener = mapRef.current.addListener('click', (e: any) => {
					if (!e.latLng) return;
					if (!addMarkerRef.current) {
						devLog('skip add marker: addMarkerRef missing');
						return;
					}
					addMarkerRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
				});

				// Setup Places Autocomplete
				if (searchInputRef.current) {
					const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
						fields: ['geometry', 'name', 'place_id'],
					});
					autocomplete.addListener('place_changed', () => {
						const place = autocomplete.getPlace();
						if (!place.geometry || !place.geometry.location) return;
						const position = {
							lat: place.geometry.location.lat(),
							lng: place.geometry.location.lng(),
						};
						devLog('pan to search result', position);
						mapRef.current?.panTo(position);
						mapRef.current?.setZoom(15);
						if (!addMarkerRef.current) {
							devLog('skip add marker from search: addMarkerRef missing');
							return;
						}
						addMarkerRef.current?.(position, { name: place.name ?? undefined, placeId: place.place_id });
					});
				}

				setIsReady(true);
				hasInitializedRef.current = true;
			} catch (_err) {
				// Intentionally no-op: UI will remain but map won't initialize
			}
		}

		init();

		return () => {
			if (mapClickListener) {
				mapClickListener.remove();
			}
			if (!hasInitializedRef.current) return;
			// only clean up markers on unmount
			markersRef.current.forEach(entry => entry.marker.setMap(null));
			markersRef.current.clear();
		};
	}, [apiKey, initialZoom, devLog]);

	return (
		<div className="relative h-screen w-full">
			<div className="absolute top-0 left-0 right-0 z-10 p-3">
				<div className="max-w-xl mx-auto">
					<input
						ref={searchInputRef}
						type="text"
						placeholder="Search for a place..."
						className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 shadow-sm focus:border-blue-500 focus:outline-none"
					/>
				</div>
			</div>
			<div ref={mapContainerRef} className="h-full w-full" />

			{/* Hidden state readout useful for debugging and tests */}
			<div aria-hidden className="hidden">
				{isReady ? 'ready' : 'loading'} | pins: {pins.length}
			</div>
		</div>
	);
};

export default GoogleMap;
