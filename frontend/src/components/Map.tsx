import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/// <reference types="@types/google.maps" />

export type MapPin = {
	id?: string;
	tripId?: string;
	latitude: number;
	longitude: number;
	name?: string;
	placeId?: string;
	notes?: string;
	clientId?: string;
};

type MapProps = {
	apiKey?: string;
	initialCenter?: { lat: number; lng: number };
	initialZoom?: number;
	initialPins?: MapPin[];
	pins?: MapPin[];
	selectedPinId?: string | null;
	onPinAdd?: (pin: MapPin) => Promise<MapPin | void> | void;
	onPinDelete?: (pinId: string) => void;
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

export const GoogleMap: React.FC<MapProps> = ({
	apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
	initialCenter,
	initialZoom = 12,
	initialPins = [],
	pins: controlledPins,
	selectedPinId,
	onPinAdd,
	onPinDelete,
}) => {
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const mapRef = useRef<any>(null);
	const markersRef = useRef<Map<string, { marker: any; pin: MapPin; infoWindow: any | null }>>(
		new window.Map()
	);

	const [isReady, setIsReady] = useState(false);
	const [pins, setPins] = useState<MapPin[]>([]);

	const defaultCenter = useMemo(() => initialCenter ?? { lat: 37.7749, lng: -122.4194 }, [initialCenter]);

	const createClientId = useCallback(() => {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
		return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}, []);

	const getPinKey = useCallback((pin: MapPin) => {
		return pin.clientId ?? pin.id ?? `${pin.latitude},${pin.longitude},${pin.placeId ?? ''}`;
	}, []);

	const buildInfoWindowContent = useCallback(
		(pin: MapPin) => {
			const wrapper = document.createElement('div');
			wrapper.className = 'map-pin-info';
			const title = document.createElement('div');
			title.textContent = pin.name ?? 'Pinned place';
			title.style.fontWeight = '600';
			title.style.marginBottom = '4px';

			const meta = document.createElement('div');
			meta.textContent = pin.notes ?? '';
			meta.style.fontSize = '12px';
			meta.style.color = '#475569';

			wrapper.appendChild(title);
			if (pin.notes) {
				wrapper.appendChild(meta);
			}

			if (pin.id && onPinDelete) {
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = 'Delete pin';
				button.style.marginTop = '8px';
				button.style.padding = '4px 8px';
				button.style.fontSize = '12px';
				button.style.border = '1px solid #e2e8f0';
				button.style.borderRadius = '6px';
				button.style.background = '#fff';
				button.style.cursor = 'pointer';
				button.addEventListener('click', () => onPinDelete(pin.id!));
				wrapper.appendChild(button);
			}

			return wrapper;
		},
		[onPinDelete]
	);

	const createMarkerForPin = useCallback(
		(pin: MapPin) => {
			if (!mapRef.current || !window.google?.maps) return;
			const key = getPinKey(pin);
			if (markersRef.current.has(key)) return;

			const marker = new window.google.maps.Marker({
				position: { lat: pin.latitude, lng: pin.longitude },
				map: mapRef.current,
				title: pin.name ?? undefined,
				label: pin.name ? { text: pin.name.slice(0, 14), fontSize: '11px', fontWeight: '600' } : undefined,
			});

			const infoWindow = new window.google.maps.InfoWindow({ content: buildInfoWindowContent(pin) });
			marker.addListener('click', () => {
				infoWindow.setContent(buildInfoWindowContent(pin));
				infoWindow.open({ anchor: marker, map: mapRef.current });
			});

			markersRef.current.set(key, { marker, pin, infoWindow });
		},
		[buildInfoWindowContent, getPinKey]
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
				if (pin.name) {
					existing.marker.setLabel({ text: pin.name.slice(0, 14), fontSize: '11px', fontWeight: '600' });
				}
			});
		},
		[createMarkerForPin, getPinKey]
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
		if (!isReady || initialPins.length === 0) return;
		initialPins.forEach(pin => {
			void addMarkerForPin(pin, false);
		});
	}, [addMarkerForPin, initialPins, isReady]);

	useEffect(() => {
		if (!isReady) return;
		const nextPins = controlledPins ?? pins;
		syncMarkers(nextPins);
	}, [controlledPins, isReady, pins, syncMarkers]);

	useEffect(() => {
		if (controlledPins) {
			setPins(controlledPins);
		}
	}, [controlledPins]);

	useEffect(() => {
		if (!selectedPinId || !mapRef.current) return;
		const entry = Array.from(markersRef.current.values()).find(item => item.pin.id === selectedPinId);
		if (!entry) return;
		mapRef.current.panTo({ lat: entry.pin.latitude, lng: entry.pin.longitude });
		mapRef.current.setZoom(14);
		entry.infoWindow?.setContent(buildInfoWindowContent(entry.pin));
		entry.infoWindow?.open({ anchor: entry.marker, map: mapRef.current });
	}, [buildInfoWindowContent, selectedPinId]);

	useEffect(() => {
		let mapClickListener: any = null;

		async function init() {
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

				// Click to drop a marker
				mapClickListener = mapRef.current.addListener('click', (e: any) => {
					if (!e.latLng) return;
					addMarker({ lat: e.latLng.lat(), lng: e.latLng.lng() });
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
						mapRef.current?.panTo(position);
						mapRef.current?.setZoom(14);
						addMarker(position, { name: place.name ?? undefined, placeId: place.place_id });
					});
				}

				setIsReady(true);
			} catch (_err) {
				// Intentionally no-op: UI will remain but map won't initialize
			}
		}

		init();

		return () => {
			if (mapClickListener) {
				mapClickListener.remove();
			}
			markersRef.current.forEach(entry => entry.marker.setMap(null));
			markersRef.current.clear();
		};
	}, [apiKey, defaultCenter, initialZoom, addMarker]);

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
