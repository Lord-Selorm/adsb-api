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
| `USE_MOCK`      | `true` = simulated feed (no hardware), `false` = ADSR-800 serial | `true`   |
| `SERIAL_PORT`   | COM port when `USE_MOCK=false`                           | `COM3`    |
| `SERIAL_BAUD`   | Serial baud rate for the ADSR-800                        | `460800`  |
| `MOCK_AIRCRAFT` | How many synthetic aircraft the mock emits                | `8`       |
| `MOCK_TICK_MS`  | Mock emission interval in ms                              | `1000`    |
| `PORT`          | HTTP/WebSocket port                                      | `3000`    |
| `RECEIVER_LAT/LON` | Receiver coordinates, used as CPR local-decode reference | `52`, `4` |
| `AIR_STALE_MS`  | Ms of silence before an aircraft is flagged `stale`       | `15000`   |
| `AIR_EVICT_MS`  | Ms of silence before an aircraft is dropped from the store | `60000`   |

Run without a receiver first (this is also the default when unset):

```dotenv
USE_MOCK=true
```

For the real ADSR-800 over serial:

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
| `source` | Active transport: `mock` or `serial` |
| `trackedAircraft` | Number of aircraft in the store |
| `malformedMessageCount` | Frames that failed framing/CRC validation |
| `secondsSinceLastMessage` | Seconds since the last decoded message (0 = live) |
| `connectionStatus` | Transport state: `connected`, `connecting`, etc. |

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