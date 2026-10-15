# Hotel Rooms API (A5)

A small in-memory REST API for the Hotel Rooms assessment. It starts with an empty inventory and listens on port 8080 by default.

## Run

1. Install Node.js 18 or newer.
2. Open this folder in VS Code and run `npm install` in its terminal.
3. Run `npm start` and leave the terminal running.
4. In a second terminal, use your assessment kit's instructions to register and run its evaluator. Keep your PIN private.

To change the port, set the `PORT` environment variable before starting the server.

## Endpoints

- `POST /api/rooms` creates a room.
- `GET /api/rooms` lists rooms; supports `page`, `limit`, `search`, `type`, `available`, `minPricePerNight`, `maxPricePerNight`, `sort`, and `order`.
- `GET /api/rooms/:id` reads one room.
- `PUT /api/rooms/:id` replaces all editable fields.
- `PATCH /api/rooms/:id` changes supplied editable fields.
- `DELETE /api/rooms/:id` deletes one room.

A room uses `name`, `location`, `type`, `pricePerNight`, `capacity`, `available`, and `roomNumber`; the server creates `id`. Inventory exists only in memory, so restarting the server clears it.

## Example request

```json
{
  "name": "Lake View Deluxe",
  "location": "Ooty",
  "type": "Deluxe",
  "pricePerNight": 4500,
  "capacity": 3,
  "available": true,
  "roomNumber": "R-204"
}
```
