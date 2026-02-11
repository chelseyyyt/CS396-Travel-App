import os
from typing import Any, Dict, List, Optional, Tuple

import requests

PLACE_BIAS_RADIUS_METERS = 50000


def _get_api_key() -> str:
    return (
        os.getenv('GOOGLE_MAPS_API_KEY')
        or os.getenv('GOOGLE_PLACES_API_KEY')
        or os.getenv('GOOGLE_MAPS_API_TOKEN')
        or ''
    )


def geocode_location_hint(location_hint: str) -> Optional[Tuple[float, float]]:
    api_key = _get_api_key()
    if not api_key:
        return None
    url = 'https://maps.googleapis.com/maps/api/geocode/json'
    params = {'address': location_hint, 'key': api_key}
    response = requests.get(url, params=params, timeout=20)
    response.raise_for_status()
    data = response.json()
    location = data.get('results', [{}])[0].get('geometry', {}).get('location')
    if not location:
        return None
    return float(location.get('lat')), float(location.get('lng'))


def places_text_search(query: str, location_bias: Optional[Tuple[float, float]]) -> Optional[Dict[str, Any]]:
    api_key = _get_api_key()
    if not api_key:
        return None
    url = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
    params = {'query': query, 'key': api_key}
    if location_bias:
        params['location'] = f"{location_bias[0]},{location_bias[1]}"
        params['radius'] = str(PLACE_BIAS_RADIUS_METERS)
    response = requests.get(url, params=params, timeout=20)
    response.raise_for_status()
    data = response.json()
    result = (data.get('results') or [None])[0]
    if not result:
        return None
    return {
        'places_name': result.get('name'),
        'places_place_id': result.get('place_id'),
        'places_address': result.get('formatted_address'),
        'latitude': (result.get('geometry') or {}).get('location', {}).get('lat'),
        'longitude': (result.get('geometry') or {}).get('location', {}).get('lng'),
        'places_raw': data,
    }


def enrich_candidates_with_places(
    candidates: List[Dict[str, Any]],
    location_hint: Optional[str],
    *,
    places_search_fn=places_text_search,
    geocode_fn=geocode_location_hint,
) -> List[Dict[str, Any]]:
    api_key_present = bool(_get_api_key())
    print('[worker] places enrichment', {'count': len(candidates), 'has_api_key': api_key_present})

    if not api_key_present:
        enriched = []
        for candidate in candidates:
            name = str(candidate.get('name') or '').strip()
            candidate['places_query'] = name
            candidate['places_failed'] = True
            print(
                '[worker] places missing',
                {
                    'name': name,
                    'query': name,
                    'place_id': None,
                    'latitude': None,
                    'longitude': None,
                    'places_failed': True,
                },
            )
            enriched.append(candidate)
        return enriched

    location_bias: Optional[Tuple[float, float]] = None
    if location_hint:
        try:
            location_bias = geocode_fn(location_hint)
        except Exception:
            location_bias = None

    enriched: List[Dict[str, Any]] = []
    for candidate in candidates:
        name = str(candidate.get('name') or '').strip()
        candidate['places_query'] = name
        if not name:
            candidate['places_failed'] = True
            print(
                '[worker] places missing',
                {
                    'name': name,
                    'query': name,
                    'place_id': None,
                    'latitude': None,
                    'longitude': None,
                    'places_failed': True,
                },
            )
            enriched.append(candidate)
            continue

        try:
            places = places_search_fn(name, location_bias)
        except Exception:
            places = None

        if places and places.get('latitude') is not None and places.get('longitude') is not None:
            candidate['places_failed'] = False
            candidate.update(places)
        else:
            candidate['places_failed'] = True

        print(
            '[worker] places result',
            {
                'name': name,
                'query': candidate.get('places_query'),
                'place_id': candidate.get('places_place_id'),
                'latitude': candidate.get('latitude'),
                'longitude': candidate.get('longitude'),
                'places_failed': candidate.get('places_failed'),
            },
        )

        enriched.append(candidate)

    print('[worker] places enrichment complete', {'count': len(enriched)})
    return enriched
