export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-6">About TravelApp</h1>
          <div className="prose prose-lg">
            <p className="text-gray-700 mb-4">
              TravelApp is a trip planning web application designed to help travelers
              organize their destinations and plan itineraries with ease.
            </p>
            <p className="text-gray-700 mb-4">
              Built with modern web technologies including React, TypeScript, and Google Maps,
              TravelApp provides an intuitive interface for searching locations, pinning them
              on a map, and organizing them into trips.
            </p>
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Features</h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>Search for locations using Google Places API</li>
              <li>Pin locations directly on an interactive map</li>
              <li>Organize pins into trips</li>
              <li>Save and manage your travel plans</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

