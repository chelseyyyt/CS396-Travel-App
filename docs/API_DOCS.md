# API Documentation

## Trips

Base path: `/api/trips`

### Create Trip
- **Method**: POST
- **Route**: `/api/trips`
- **Description**: Create a new trip for a user.
- **Request Body (JSON)**:
  - `user_id` (string, UUID, required)
  - `title` (string, 1-200 chars, required)
  - `description` (string, ≤2000 chars, optional)
- **Responses**:
  - 201: `{ data: Trip, error: null }`
  - 400: `{ data: null, error: ZodError | string }`
  - 500: `{ data: null, error: string }`

### List Trips (by user)
- **Method**: GET
- **Route**: `/api/trips?user_id={uuid}`
- **Description**: Get all trips that belong to a user.
- **Query Params**:
  - `user_id` (string, UUID, required)
- **Responses**:
  - 200: `{ data: Trip[], error: null }`
  - 400: `{ data: null, error: string }`
  - 500: `{ data: null, error: string }`

### Get Trip by ID
- **Method**: GET
- **Route**: `/api/trips/:id`
- **Description**: Get a single trip by its ID.
- **Responses**:
  - 200: `{ data: Trip, error: null }`
  - 404: `{ data: null, error: 'Trip not found' }`
  - 500: `{ data: null, error: string }`

### Update Trip
- **Method**: PUT
- **Route**: `/api/trips/:id`
- **Description**: Update an existing trip.
- **Request Body (JSON)**:
  - `title` (string, 1-200 chars, optional)
  - `description` (string, ≤2000 chars, optional)
- **Responses**:
  - 200: `{ data: Trip, error: null }`
  - 400: `{ data: null, error: ZodError | string }`
  - 404: `{ data: null, error: 'Trip not found' }`
  - 500: `{ data: null, error: string }`

### Delete Trip
- **Method**: DELETE
- **Route**: `/api/trips/:id`
- **Description**: Delete a trip by its ID.
- **Responses**:
  - 204: `{ data: null, error: null }`
  - 404: `{ data: null, error: 'Trip not found' }`
  - 500: `{ data: null, error: string }`

### Types

```ts
interface Trip {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: string; // ISO timestamp
}
```
