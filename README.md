# ADS-B API

Internal API for live flight tracking data from an **ADSR-800 Mode-S/ADS-B receiver** (connected via RS232 serial at 460800 baud). The service ingests raw DF17 Extended Squitter frames, decodes Mode S/ADS-B messages (position via CPR, altitude, velocity, callsign), maintains a per-aircraft in-memory track, and exposes the live picture over **REST** and **WebSocket** — a FlightRadar24-style backend for a single receiver. A `mock` transport simulates the receiver, so the entire pipeline (decode → track → API) runs with zero hardware.

## Setup

```bash
npm install
```

Copy the environment template and adjust:

```bash
cp .env.example .env
```

Key variables:

| Variable        | Purpose                                                  | Example   |
| --------------- | -------------------------------------------------------- | --------- |
| `USE_MOCK`      | `true` = simulated feed (no hardware), `false` = real receiver | `true`   |
| `TCP_HOST`      | Serial-bridge IP when `USE_MOCK=false` (USR-TCP232-ED2)  | `192.168.0.7` |
| `TCP_PORT`      | Bridge TCP port; TCP transport is used when `> 0`        | `8235`    |
| `TCP_RECONNECT_MS` | Reconnect delay for the TCP socket (ms)              | `1000`    |
| `SERIAL_PORT`   | COM port when `USE_MOCK=false` and no `TCP_PORT`         | `COM3`    |
| `SERIAL_BAUD`   | Serial baud rate for the ADSR-800                        | `460800`  |
| `MOCK_AIRCRAFT` | How many synthetic aircraft the mock emits                | `8`       |
| `MOCK_TICK_MS`  | Mock emission interval in ms                              | `1000`    |
| `PORT`          | HTTP/WebSocket port                                      | `3000`    |
| `RECEIVER_LAT/LON` | Receiver coordinates, used as CPR local-decode reference | `52`, `4` |
| `AIR_STALE_MS`  | Ms of silence before an aircraft is flagged `stale`       | `15000`   |
| `AIR_EVICT_MS`  | Ms of silence before an aircraft is dropped from the store | `60000`   |
| `DATABASE_URL`  | PostgreSQL/TimescaleDB connection string (blank = disabled) | `postgres://...` |

Run without a receiver first (this is also the default when unset):

```dotenv
USE_MOCK=true
```

For the real ADSR-800 over a TCP serial bridge (USR-TCP232-ED2, TCP-Server mode listening on port 8235):

```dotenv
USE_MOCK=false
TCP_HOST=192.168.0.7
TCP_PORT=8235
```

For the real ADSR-800 directly on a COM port:

```dotenv
USE_MOCK=false
SERIAL_PORT=COM3
```

## Run

```bash
npm run start:dev
```

The app boots on `http://localhost:3000`, connects the ingress transport (mock or serial), and begins tracking once frames arrive.

## REST API

All routes are prefixed with `/api`.

### `GET /api/aircraft`

Live snapshot of every tracked aircraft.

```json
{
  "count": 8,
  "aircraft": [
    {
      "icao": "4a0001",
      "callsign": "NEST101",
      "altitude": 9125,
      "lat": 51.467362743313025,
      "lon": 4.241485595703125,
      "speed": 395,
      "heading": 135.20462691396588,
      "verticalRate": 832,
      "positionSource": "global",
      "firstSeenAt": 1788624809850,
      "lastUpdatedAt": 1788644197433,
      "stale": false
    },
    {
      "icao": "4a0002",
      "callsign": "NEST102",
      "altitude": 29000,
      "lat": 51.83568404892743,
      "lon": 3.8495635986328125,
      "speed": 358,
      "heading": 142.93826452354548,
      "verticalRate": -576,
      "positionSource": "global",
      "firstSeenAt": 1788624809853,
      "lastUpdatedAt": 1788644197433,
      "stale": false
    }
  ]
}
```

Returns `404 Not Found` with `{"message":"Unknown ICAO address: <icao>","error":"Not Found","statusCode":404}` only if **no aircraft exist**; otherwise a snapshot of all tracked aircraft.

### `GET /api/aircraft/:icao`

Detail for a single aircraft (ICAO in lowercase hex).

```json
{
  "icao": "4a0001",
  "callsign": "NEST101",
  "altitude": 9125,
  "lat": 51.467362743313025,
  "lon": 4.241485595703125,
  "speed": 395,
  "heading": 135.20462691396588,
  "verticalRate": 832,
  "positionSource": "global",
  "firstSeenAt": 1788624809850,
  "lastUpdatedAt": 1788644197433,
  "stale": false
}
```

Returns `404 Not Found` when the ICAO is not being tracked:

```json
{
  "message": "Unknown ICAO address: ffffff",
  "error": "Not Found",
  "statusCode": 404
}
```

### `GET /api/health`

Liveness + ingress/feed status.

```json
{
  "status": "ok",
  "uptimeSeconds": 296.2559584,
  "source": "mock",
  "trackedAircraft": 8,
  "malformedMessageCount": 0,
  "secondsSinceLastMessage": 0,
  "connectionStatus": "connected"
}
```

| Field | Meaning |
| --- | --- |
| `status` | `"ok"` while the process is healthy |
| `uptimeSeconds` | Process uptime in seconds |
| `source` | Active transport kind: `mock`, `serial`, or `tcp` |
| `trackedAircraft` | Number of aircraft in the store |
| `malformedMessageCount` | Frames that failed framing/CRC validation |
| `secondsSinceLastMessage` | Seconds since the last decoded message (0 = live) |
| `connectionStatus` | Transport state: `connected`, `connecting`, etc. |

### `GET /api/flights/list`

List distinct aircraft seen within a time range (requires `DATABASE_URL`).

| Param | Default | Description |
| --- | --- | --- |
| `from` | 1 hour ago | ISO 8601 start time |
| `to` | now | ISO 8601 end time |
| `limit` | 100 | Max rows |

```json
[
  {
    "icao": "89630c",
    "first_seen": "2026-09-07T12:54:20.209Z",
    "last_seen": "2026-09-07T13:10:42.118Z",
    "message_count": "487"
  }
]
```

### `GET /api/flights/positions/:icao`

Full position history for a single aircraft within a time range.

| Param | Default | Description |
| --- | --- | --- |
| `from` | 1 hour ago | ISO 8601 start time |
| `to` | now | ISO 8601 end time |

Returns an array of position rows: `time`, `icao`, `callsign`, `latitude`, `longitude`, `altitude`, `heading`, `speed`, `vertical_rate`, `squawk`, `position_source`, `on_ground`.

### `GET /api/flights/count`

Total number of rows stored in `aircraft_positions`.

## WebSocket

A Socket.IO server runs alongside HTTP at `/socket.io` (namespace `/`). Connect with any Socket.IO client:

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');
```

### `aircraft:list` (client → server)

Request the current full snapshot; the server replies with the same payload shape as `GET /api/aircraft`.

```js
socket.emit('aircraft:list', (res) => {
  console.log(res.count, res.aircraft);
});
```

Response:

```json
{
  "count": 8,
  "aircraft": [
    {
      "icao": "4a0001",
      "callsign": "NEST101",
      "altitude": 9125,
      "lat": 51.467362743313025,
      "lon": 4.241485595703125,
      "speed": 395,
      "heading": 135.20462691396588,
      "verticalRate": 832,
      "positionSource": "global",
      "firstSeenAt": 1788624809850,
      "lastUpdatedAt": 1788644197433,
      "stale": false
    }
  ]
}
```

### Server → client events

| Event | Payload | When |
| --- | --- | --- |
| `aircraft:update` | `AircraftState` object | Any decoded message mutates an aircraft's state (position, altitude, speed, callsign, …) |
| `aircraft:remove` | `{ "icao": "4a0001", "at": 1788644257433 }` | An aircraft is evicted after `AIR_EVICT_MS` of silence |

```js
socket.on('aircraft:update', (ac) => {
  // {icao: "4a0001", lat: ..., lon: ..., altitude: ..., ...}
});

socket.on('aircraft:remove', ({ icao }) => {
  console.log('Gone:', icao);
});
```

## Architecture

```
ADSR-800 (RS232, 460800 baud)
   │  DF17 extended squitter bytes
   ▼
Ingress layer ── transport: Serial │ Mock │ TCP │ UDP (DataSource contract)
   │  raw bytes
   ▼
FramingDetector ── auto-detects Beast binary / AVR ASCII / raw hex
   │  frames (14-byte / 7-byte)
   ▼
ModeSDecoder ── CRC24, DF/ICAO, AC12 altitude (Q-bit), velocity, callsign
   │  DecodedMessage{ airbornePosition{ cprLat, cprLon, odd }, ... }
   ▼
AircraftStoreService ── per-ICAO CprTracker (CPR global+local), in-memory Map
   │  60s eviction, 15s stale flag, EventEmitter('update'|'remove')
   ▼
Serving layer ──────────── REST (AircraftController, HealthController)
                        └─ WebSocket (AircraftGateway → Socket.IO)
```

The pipeline is decoupled through the `DataSource` interface, so swapping the ADSR-800 serial feed for a networked (TCP/UDP) receiver or the mock simulator requires no changes downstream. Position fields like `lat`/`lon` are resolved from raw CPR values by the `CprTracker` (global even/odd pairs within 10s, else local decode against the receiver position).

## TimescaleDB (optional)

Every aircraft state update is buffered and batch-inserted into a time-series table (`aircraft_positions`). It works with **TimescaleDB** (hypertable) or **plain PostgreSQL** (Supabase / Neon / RDS) — the app auto-detects: if the `timescaledb` extension is absent it falls back to a normal table with an index. When `DATABASE_URL` is not set, persistence is silently disabled and the API runs live-only.

**Setup with Docker (TimescaleDB):**

```bash
docker run -d --name timescaledb -p 5432:5432 -e POSTGRES_PASSWORD=postgres timescale/timescaledb:latest-pg16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/adsb
```

**Setup with hosted plain Postgres (no Docker, no install):**

Create a free project at [Supabase](https://supabase.com) or [Neon](https://neon.tech), copy its connection string, and set it as `DATABASE_URL`. The table auto-creates on first boot — nothing else to configure.

The `aircraft_positions` table is created automatically on first boot (hypertable when TimescaleDB is present). Rows are batch-flushed every 5 seconds or every 200 records, whichever comes first.

**Query examples:**

```sql
-- All positions for an aircraft in the last hour
SELECT * FROM aircraft_positions
WHERE icao = '89630c' AND time > now() - interval '1 hour'
ORDER BY time;

-- Distinct aircraft seen today
SELECT icao, MIN(time), MAX(time), COUNT(*)
FROM aircraft_positions WHERE time > current_date
GROUP BY icao ORDER BY 2 DESC;

-- Downsample: positions per 10-minute bucket
SELECT time_bucket('10 minutes', time) AS bucket, icao, COUNT(*)
FROM aircraft_positions GROUP BY bucket, icao ORDER BY bucket;
```

## Docker deployment (shared central database)

The recommended production topology: **one central TimescaleDB on a server**, and every ADS-B API instance (local or remote) writes to it. End users never run a database — they just point their API at the shared URL.

### 1. Start the central database (once, on a server/VPS)

```bash
export POSTGRES_USER=adsb
export POSTGRES_PASSWORD='change-me-strong-password'
export POSTGRES_DB=adsb
docker compose -f docker-compose.db.yml up -d
```

The inline `docker-compose.yml` is the local-dev equivalent (user `adsb`, password `postgres`, DB `adsb`).

### 2. Point every API instance at it

Each API host sets only the connection string to the shared DB:

```dotenv
DATABASE_URL=postgres://adsb:<password>@<server-host>:5432/adsb
```

The schema (hypertable) auto-creates on first boot — nothing else to set up per user. All users then query the same live + historical data.

### 3. (Optional) Run the API itself in Docker

```bash
docker build -f Dockerfile.api -t adsb-api .
docker run -d --name adsb-api -p 3000:3000 \
  -e DATABASE_URL=postgres://adsb:<password>@<server-host>:5432/adsb \
  -e TCP_HOST=192.168.0.7 -e TCP_PORT=8235 -e USE_MOCK=false \
  adsb-api
```

Containerizing the API lets multi-user deployments share compute too; only the receiver host connects to the actual hardware.