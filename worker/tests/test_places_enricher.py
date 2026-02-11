from places_enricher import enrich_candidates_with_places


def test_enrich_candidates_with_mock() -> None:
    def fake_places_search(query, _bias):
        return {
            'places_name': query,
            'places_place_id': 'place-123',
            'places_address': '123 Test St',
            'latitude': 41.0,
            'longitude': -87.0,
            'places_raw': {'ok': True},
        }

    candidates = [{'name': "Daisy's", 'confidence': 0.9}]
    enriched = enrich_candidates_with_places(candidates, 'Chicago, IL', places_search_fn=fake_places_search, geocode_fn=lambda _: (41.0, -87.0))

    assert enriched[0]['places_name'] == "Daisy's"
    assert enriched[0]['places_place_id'] == 'place-123'
    assert enriched[0]['places_address'] == '123 Test St'
    assert enriched[0]['latitude'] == 41.0
    assert enriched[0]['longitude'] == -87.0
    assert enriched[0]['places_failed'] is False
