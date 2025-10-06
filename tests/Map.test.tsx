import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Map from '../components/Map';

describe('Map component', () => {
	it('renders input and map container', () => {
		render(<Map apiKey="TEST_KEY" />);
		// Input should be in the document
		expect(screen.getByPlaceholderText('Search for a place...')).toBeInTheDocument();
		// There should be a map container element (div with role not set, so query by text fallback)
		// We at least confirm the page rendered without crashing.
		expect(document.querySelector('div.h-full.w-full')).toBeTruthy();
	});
});


