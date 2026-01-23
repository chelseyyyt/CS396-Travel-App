import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Plan Your Perfect Trip
          </h1>
          <p className="text-xl text-gray-700 mb-8">
            Search for locations, pin them on a map, and organize your travel itinerary
            all in one place. Simple, intuitive, and designed for travelers.
          </p>
          <Link
            to="/planner"
            className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
          >
            Open Planner
          </Link>
        </div>

        <div className="max-w-6xl mx-auto mt-20 grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-4">🗺️</div>
            <h3 className="text-xl font-semibold mb-2">Interactive Maps</h3>
            <p className="text-gray-600">
              Search and pin locations using Google Maps integration
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-4">📍</div>
            <h3 className="text-xl font-semibold mb-2">Save Your Pins</h3>
            <p className="text-gray-600">
              Organize your favorite places into trips and itineraries
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-3xl mb-4">✈️</div>
            <h3 className="text-xl font-semibold mb-2">Plan Your Journey</h3>
            <p className="text-gray-600">
              Visualize your route and plan the perfect travel experience
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

