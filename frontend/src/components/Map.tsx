import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/// <reference types="@types/google.maps" />

type Pin = {
	latitude: number;
	longitude: number;
	name?: string;
	placeId?: string;
};

type MapProps = {
	apiKey?: string;
	initialCenter?: { lat: number; lng: number };
	initialZoom?: number;
	onPinAdd?: (pin: Pin) => void;
};

// Type declarations for Google Maps (loaded dynamically)
declare global {
	interface Window {
		google?: {
			maps: {
				Map: new (element: HTMLElement, options?: any) => any;
				Marker: new (options?: any) => any;
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

export const Map: React.FC<MapProps> = ({ 
	apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '', 
	initialCenter, 
	initialZoom = 12, 
	onPinAdd 
}) => {
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const mapRef = useRef<any>(null);
	const markersRef = useRef<any[]>([]);

	const [isReady, setIsReady] = useState(false);
	const [pins, setPins] = useState<Pin[]>([]);

	const defaultCenter = useMemo(() => initialCenter ?? { lat: 37.7749, lng: -122.4194 }, [initialCenter]);

	const addMarker = useCallback((position: { lat: number; lng: number }, meta?: { name?: string; placeId?: string }) => {
		if (!mapRef.current || !window.google?.maps) return;
		const marker = new window.google.maps.Marker({
			position,
			map: mapRef.current,
		});
		markersRef.current.push(marker);

		const newPin: Pin = { latitude: position.lat, longitude: position.lng, name: meta?.name, placeId: meta?.placeId };
		setPins(prev => [...prev, newPin]);
		if (onPinAdd) onPinAdd(newPin);
	}, [onPinAdd]);

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
			// Clean up markers
			markersRef.current.forEach(m => m.setMap(null));
			markersRef.current = [];
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

export default Map;


