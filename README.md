# ADS-B API

Internal API for live flight tracking data from an **ADSR-800 Mode-S/ADS-B receiver** (connected via RS232 serial at 460800 baud). The service ingests raw DF17 Extended Squitter frames, decodes Mode S/ADS-B messages (position via CPR, altitude, velocity, callsign), maintains a per-aircraft in-memory track, and exposes the live picture over **REST** and **WebSocket** — a FlightRadar24-style backend for a single receiver. A `mock` transport simulates the receiver, so the entire pipeline (decode → track → API) runs with zero hardware.

## Quick start

From this directory (Node 18+, `npm install` already done):

```powershell
npm run build          # compile once (or after any code change)
npm run start:prod     # start the API
```

That boots the service on `http://localhost:3000` using **simulated feeds only** (mock ADS-B aircraft + mock drones) — zero hardware required, ideal for a first spin or CI.

To connect the **physical URM-02 Drone RID module** as well, set one variable before starting (Windows PowerShell):

```powershell
$env:RID_USE_MOCK = 'false'
npm run start:prod
```

`RID_UDP_HOST` / `RID_UDP_PORT` already default to `0.0.0.0:65100` (the URM-02's default IP/port), so nothing else needs setting. The ADS-B feed can stay mocked or go real via `USE_MOCK=false` (see **Setup** below).

### Confirm it's alive

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Expect `status: ok`, `connectionStatus: connected` (ADS-B) and — with the URM-02 attached — `ridSource: rid_udp`, `ridConnectionStatus: connected`, with `ridSecondsSinceLastMessage` near `0` (heartbeats arriving from the module).

### Common issues

| Symptom | Cause / fix |
| --- | --- |
| `EADDRINUSE ... port: 3000` on start | Another API instance is already running — stop it (`Ctrl+C`, or `Stop-Process -Id <pid> -Force`) |
| `ridConnectionStatus: disconnected` / no drones | The URM-02's UDP stream isn't reaching the API — make sure **no other tool** is listening on UDP `65100` (a raw UDP listener or Wireshark capture on that port steals the packets) |
| `ridSecondsSinceLastMessage` keeps growing | Device not talking — check the URM-02 is powered and reachable at its default IP `192.168.0.3` |
| URM-02 heartbeats show `longitude:0, latitude:0` + `1970` clock | GPS/GNSS fix not acquired — put the module + GNSS antenna near a window/outdoors and wait 1–3 min (detection still works without a fix) |

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
| `SERIAL_INIT_COMMANDS` | ADSR-800 config lines sent after the port opens (see below) | `SetOutput=1` |
| `MOCK_AIRCRAFT` | How many synthetic aircraft the mock emits                | `8`       |
| `MOCK_TICK_MS`  | Mock emission interval in ms                              | `1000`    |
| `PORT`          | HTTP/WebSocket port                                      | `3000`    |
| `RECEIVER_LAT/LON` | Receiver coordinates, used as CPR local-decode reference | `52`, `4` |
| `AIR_STALE_MS`  | Ms of silence before an aircraft is flagged `stale`       | `15000`   |
| `AIR_EVICT_MS`  | Ms of silence before an aircraft is dropped from the store | `60000`   |
| `RID_USE_MOCK`  | `true` = simulated Drone Remote ID feed, `false` = physical URM-02 via UDP | `true` |
| `RID_MOCK_DRONES` | How many synthetic drones the RID mock emits             | `3`       |
| `RID_MOCK_TICK_MS` | RID mock emission interval in ms                        | `1000`    |
| `RID_UDP_HOST` / `RID_UDP_PORT` | URM-02 UDP listen address/port (device default IP `192.168.0.3`, streams to port 65100) | `0.0.0.0` / `65100` |
| `RID_STALE_MS` / `RID_EVICT_MS` | RID stale flag / eviction thresholds (ms) | `15000` / `60000` |
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
# Optional: re-affirm ADS-B output right after the port opens (the ADSR-800
# accepts plain-text config within ~5s of its boot banner; a fresh unit may
# boot output-disabled). Comma-separate multiple commands, or leave empty.
SERIAL_INIT_COMMANDS=SetOutput=1
```

> **Live-troubleshooting**: if a connected module boots output-disabled or at a
> different baud, the framer now stays up instead of crashing — it logs an
> `UnrecognizedFramingError`, resets, and keeps scanning for valid frames.

## Run

Development mode (auto-reloads on file changes):

```bash
npm run start:dev
```

Production build (compiled, no watch):

```bash
npm run build
npm run start:prod
```

Both boot on `http://localhost:3000` and begin tracking once frames arrive. For real hardware, set the environment variable **before** starting:

- **URM-02 Drone RID over UDP:** `$env:RID_USE_MOCK = 'false'`
- **ADSR-800 receiver (serial or TCP bridge):** `USE_MOCK=false` + `SERIAL_PORT`/`TCP_HOST` — see Setup above.

## API documentation (Swagger / OpenAPI)

The REST surface is self-documenting — no more guessing from code:

- **Swagger UI:** `GET /api/docs`
- **Raw OpenAPI JSON:** `GET /api/docs-json` (import into Postman/Insomnia/OpenAPI generators)

Both are generated from the controller decorators, so they always match the running code.

## REST API

All routes are prefixed with `/api`.

### `GET /api/tracks`

**Recommended.** Live snapshot of every tracked object across **all sensor sources** — ADS-B aircraft and Drone Remote ID (URM-01/02). Each entry is tagged with its `source`.

| Query param | Description |
| --- | --- |
| `?source=adsb` | ADS-B aircraft only |
| `?source=drone_rid` | Drones only |
| *(omitted)* | Combined, both sources |

```json
{
  "count": 2,
  "tracks": [
    {
      "source": "adsb",
      "id": "4a0001",
      "icao": "4a0001",
      "callsign": "NEST101",
      "altitude": 9125,
      "lat": 51.467,
      "lon": 4.241,
      "speed": 395,
      "heading": 135.2,
      "verticalRate": 832,
      "positionSource": "global",
      "firstSeenAt": 1788624809850,
      "lastUpdatedAt": 1788644197433,
      "stale": false
    },
    {
      "source": "drone_rid",
      "id": "A1B2C3D4",
      "serial_number": "A1B2C3D4",
      "latitude": 51.4472,
      "longitude": 7.2665,
      "lat": 51.4472,
      "lon": 7.2665,
      "height": 12.4,
      "altitude": 140.2,
      "v_hor": 8.1,
      "v_up": 0.2,
      "app_lat": 51.4,
      "app_lon": 7.25,
      "app_alt": 98,
      "app_type": 1,
      "uav_type": "DJI Mini4Pro",
      "reg_code": "A1B2C3D4",
      "angle": 92,
      "status": 2,
      "sys_type": 1,
      "weight": 1,
      "has_allowlist": false,
      "firstSeenAt": 1788644200000,
      "lastUpdatedAt": 1788644210000,
      "stale": false
    }
  ]
}
```

`400 Bad Request` when `source` is not `adsb` or `drone_rid`.

### `GET /api/aircraft`

> **Deprecated** — kept for backward compatibility. Use `GET /api/tracks?source=adsb`; the payload shape is identical.

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

> **Deprecated** — kept for backward compatibility. Use `GET /api/tracks` (ADS-B tracks expose the same `icao` field).

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
  "connectionStatus": "connected",
  "ridSource": "rid_mock",
  "ridConnectionStatus": "connected",
  "ridSecondsSinceLastMessage": 0,
  "trackedDrones": 3
}
```

| Field | Meaning |
| --- | --- |
| `status` | `"ok"` while the process is healthy |
| `uptimeSeconds` | Process uptime in seconds |
| `source` | Active ADS-B transport kind: `mock`, `serial`, or `tcp` |
| `trackedAircraft` | Number of aircraft in the store |
| `malformedMessageCount` | Frames that failed framing/CRC validation |
| `secondsSinceLastMessage` | Seconds since the last decoded ADS-B message (0 = live) |
| `connectionStatus` | ADS-B transport state: `connected`, `connecting`, etc. |
| `ridSource` | Drone Remote ID transport kind: `rid_mock` |
| `ridConnectionStatus` | RID transport state |
| `ridSecondsSinceLastMessage` | Seconds since the last RID report (0 = live) |
| `trackedDrones` | Number of drones in the RID store |

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

// All sources:
const socket = io('http://localhost:3000');
// Only drones (or `?source=adsb` for aircraft):
const droneSocket = io('http://localhost:3000?source=drone_rid');
```

The `?source=` connect query joins a per-source room: clients get only that source's `track:update`/`track:remove` events.

### `track:list` (client → server)

Request the current full snapshot — same payload shape as `GET /api/tracks`, optionally filtered.

```js
socket.emit('track:list', { source: 'drone_rid' }, (res) => {
  console.log(res.count, res.tracks);
});
```

Legacy `aircraft:list` (ADS-B snapshot, same payload as `GET /api/aircraft`) still works.

### Server → client events

| Event | Payload | When |
| --- | --- | --- |
| `track:update` | source-tagged track object | Any decoded message mutates a track (ADS-B aircraft **or** Drone Remote ID) |
| `track:remove` | `{ "source": "...", "id": "...", "at": 1788644257433 }` | A track is evicted after its source's `EVICT_MS` of silence |
| `aircraft:update` | `AircraftState` object | *(legacy)* ADS-B-only broadcast of `track:update` |
| `aircraft:remove` | `{ "icao": "4a0001", "at": 1788644257433 }` | *(legacy)* ADS-B eviction |

```js
socket.on('track:update', (t) => {
  // t.source: "adsb" | "drone_rid"
  // adsb: {icao, callsign, lat, lon, altitude, ...}
  // drone_rid: {serial_number, latitude, longitude, height, v_hor, uav_type, ...}
});

socket.on('track:remove', ({ source, id }) => {
  console.log('Gone:', source, id);
});

// legacy alias for ADS-B only
socket.on('aircraft:update', (ac) => {
  // {icao: "4a0001", lat: ..., lon: ..., altitude: ..., ...}
});
```

## Development workflow (branches)

Three branches mirror the deployment stages:

| Branch | Purpose | Deploy target |
| --- | --- | --- |
| `dev` | Integration branch; all feature branches merge here first | staging/CI |
| `testing` | QA snapshot cut from `dev` for a verified release candidate | QA environment |
| `main` | Production code; merge here only via PR after QA sign-off | production |

Flow: `feature/<name>` → PR into `dev` → CI runs `npm run lint && npm test` → QA verifies on the `testing` branch → PR `testing`/`dev` → `main` → deploy. Do **not** push directly to `main`.

`main` is protected on both remotes (GitHub): direct pushes are blocked, every merge requires the **`Lint, build & test`** CI check to pass plus **1 approving review**, and linear history is enforced (rebase/ff-only merges). `dev` and `testing` are open.

## Architecture

```
ADSR-800 (RS232, 460800 baud)              URM-02 Drone RID module (UDP 65100)
   │  DF17 extended squitter bytes            │  {"frame_type":7|3,"frame_info":{...}} JSON lines
   ▼                                          ▼
Ingress layer ── transport:                 RID ingress ── transport: RidMock | RidUDP
   Serial | Mock | TCP | UDP                   (DataSource contract)
   │  raw bytes                                │  raw bytes
   ▼                                          ▼
FramingDetector ── Beast / AVR / raw hex      RidDecoder ── JSON line -> DroneRidState
   │  frames (14-byte / 7-byte)                │
   ▼                                          ▼
ModeSDecoder ── CRC24, DF/ICAO,              DroneRidStoreService ── per-serial Map
   AC12 altitude, velocity, callsign          (60s eviction, 15s stale, events)
   │  DecodedMessage{...}                      │
   ▼                                          │
AircraftStoreService ── per-ICAO CprTracker ──┤
   (60s eviction, 15s stale, events)          │
   ▼                                          ▼
TrackStoreService ─── merges both sources, tags each track with `source`
   │
   ▼
Serving layer ────── REST (TracksController, AircraftController, HealthController)
                  └─ WebSocket (TracksGateway → Socket.IO)
```

Each sensor (ADS-B now, Drone RID now, AIS later) keeps its own transport + decode + store behind the `DataSource` contract; `TrackStoreService` is the single merged view the API and WebSocket layer read from.

### Module map (NestJS)

```
AppModule ── imports ───────────────────────┐
   ├─ DecodeModule   (src/decode)          ├─ ModeSDecoder (shared, single instance)
   ├─ IngressModule  (src/ingress)         ├─ ADS-B transport factory (serial|tcp|mock)
   ├─ RidModule      (src/rid)             ├─ RID decoder + RID transport factory (mock | UDP)
   ├─ AircraftModule (src/aircraft)        ├─ AircraftStoreService + REST (/api/aircraft)
   ├─ TracksModule   (src/tracks)          ├─ TrackStoreService + /api/tracks + WebSocket gateway
   └─ FlightsModule  (src/flights)         └─ FlightsService (Drizzle) + /api/flights
```

Each module owns its files and exports only what consumers need; the decode layer is **not** scattered across modules anymore (`ModeSDecoder` lives in `DecodeModule` and is imported by the ingress pipeline, health checks, and tests). Folders mirror the API surface: `/api/aircraft` → `src/aircraft`, `/api/tracks` → `src/tracks`, Drone Remote ID ingestion → `src/rid`.

## TimescaleDB (in-house, Dockerized)

The data **continuously saves** into TimescaleDB. The API reads every decoded aircraft update and writes it to a time-series table (`aircraft_positions`), so history is **never lost on refresh**. No one needs to access the database directly — they just use the API, which now returns both **realtime** and **stored** data.

- Uses the official **`timescale/timescaledb`** Docker image (TimescaleDB, not plain Postgres → real hypertable).
- DB layer uses **Drizzle ORM** (`src/flights/schema.ts`) — typed schema, migrations via `npm run db:generate` / `npm run db:push`.
- Runs fully **in-house** on the company's own infrastructure — no cloud.
- `aircraft_positions` table/hypertable creates automatically on first boot; rows batch-flush every 5s or every 200 records.

### Full in-house deployment (API + TimescaleDB together)

On the company server (Docker installed), from the repo root:

```bash
# 1. Set credentials + receiver address (see .env.docker.example)
cp .env.docker.example .env
#    edit .env: POSTGRES_PASSWORD, TCP_HOST, etc.

# 2. Build & start everything (TimescaleDB + API)
docker compose up -d --build
```

The API container starts only after TimescaleDB is healthy, then continuously saves incoming data into it. Data persists in the `adsb_pgdata` volume (survives container restarts).

### Database-only (if the API runs outside Docker)

```bash
docker compose -f docker-compose.db.yml up -d
# then point any API instance at it:
DATABASE_URL=postgres://adsb:<password>@<host>:5432/adsb
```

### Stored / time-series query examples

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