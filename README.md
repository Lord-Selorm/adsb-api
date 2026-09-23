# ADS-B API

Internal API for live flight tracking from an **ADSR-800 Mode-S/ADS-B receiver** (connected via RS232 serial at 460800 baud), a **URM-01/02 Drone Remote ID module** (UDP 65100 + USB serial), and an **AIS112E maritime receiver**. The service ingests raw DF17 Extended Squitter frames, decodes Mode S/ADS-B messages (position via CPR, altitude, velocity, callsign), ingests Drone Remote ID JSON reports and AIS NMEA sentences, maintains per-entity in-memory tracks, and exposes the live picture over **REST** and **WebSocket** across all three sensors. `mock` transports simulate every receiver, so the entire pipeline (decode → track → API) runs with zero hardware.

## Quick start

From this directory (Node 18+, `npm install` already done):

```powershell
npm run build          # compile once (or after any code change)
npm run start:prod     # start the API
```

That boots the service on `http://localhost:3000` using **simulated feeds only** (mock ADS-B aircraft + mock drones + mock vessels) — zero hardware required, ideal for a first spin or CI.

To connect the **physical URM-02 Drone RID module** as well, set one variable before starting (Windows PowerShell):

```powershell
$env:RID_USE_MOCK = 'false'
npm run start:prod
```

`RID_UDP_HOST` / `RID_UDP_PORT` already default to `0.0.0.0:65100` (the URM-02 streams to port 65100 by default), so nothing else needs setting. The ADS-B feed can stay mocked or go real via `USE_MOCK=false` (see **Setup** below). The URM-02's USB Type-C path and Ethernet path are both captured when `RID_TRANSPORT=dual` (the default).

There's a friendly landing page at `GET /` listing every endpoint — convenient for demos over ngrok.

### Confirm it's alive

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Expect `status: ok`, `connectionStatus: connected` (ADS-B) and — with the URM-02 attached — `ridSource: rid_dual`, `ridConnectionStatus: connected`, with `ridSecondsSinceLastMessage` near `0` (heartbeats arriving from the module).

### Common issues

| Symptom | Cause / fix |
| --- | --- |
| `EADDRINUSE ... port: 3000` on start | Another API instance is already running — stop it (`Ctrl+C`, or `Stop-Process -Id <pid> -Force`) |
| `ridConnectionStatus: disconnected` / no drones | The URM-02's UDP stream isn't reaching the API — make sure **no other tool** is listening on UDP `65100` (a raw UDP listener or Wireshark capture on that port steals the packets) |
| `ridSecondsSinceLastMessage` keeps growing | Device not talking — check the URM-02 is powered and reachable at its default IP `192.168.0.3` |
| URM-02 heartbeats show `longitude:0, latitude:0` + `1970` clock | GPS/GNSS fix not acquired — put the module + GNSS antenna near a window/outdoors and wait 1–3 min (detection still works without a fix) |
| `trackedDrones: 0` even with the module live | The **drone itself must be broadcasting Remote ID** — DJI only transmits where RID is mandated (e.g. US/EU/China). In a non-mandated region the drone stays silent and the URM correctly reports nothing |

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
| `USE_MOCK`      | `true` = simulated ADS-B feed (no hardware), `false` = real receiver | `true`   |
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
| `RID_USE_MOCK`  | `true` = simulated Drone Remote ID feed, `false` = physical URM-02 | `true` |
| `RID_MOCK_DRONES` | How many synthetic drones the RID mock emits             | `3`       |
| `RID_MOCK_TICK_MS` | RID mock emission interval in ms                        | `1000`    |
| `RID_TRANSPORT`  | Capture path: `dual` (UDP + serial), `udp`, or `serial`  | `dual` |
| `RID_UDP_HOST` / `RID_UDP_PORT` | URM-02 UDP listen address/port (device default IP `192.168.0.3`, streams to port 65100) | `0.0.0.0` / `65100` |
| `RID_SERIAL_PORT` / `RID_SERIAL_BAUD` | URM-02 USB Type-C serial path (CH340, 115200) | `COM5` / `115200` |
| `RID_STALE_MS` / `RID_EVICT_MS` | RID stale flag / eviction thresholds (ms) | `15000` / `60000` |
| `AIS_USE_MOCK` | `true` = simulated AIS feed, `false` = real AIS receiver | `true` |
| `AIS_TRANSPORT` | `serial`, `tcp`, or `udp` (AIS112E / AIS112E-A)           | `serial` |
| `AIS_UDP_PORT` | Inbound UDP port for AIS datagrams (AIS112E-A path)      | `65110`  |
| `INFLUX_URL` | InfluxDB 2.x endpoint (blank = persistence disabled)     | `http://localhost:8086` |
| `INFLUX_TOKEN` / `INFLUX_ORG` / `INFLUX_BUCKET` | InfluxDB credentials | `…` / `adsb` / `adsb` |

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

- **URM-02 Drone RID:** `$env:RID_USE_MOCK = 'false'` (UDP + serial, transport `dual`)
- **ADSR-800 receiver (serial or TCP bridge):** `USE_MOCK=false` + `SERIAL_PORT`/`TCP_HOST` — see Setup above.
- **AIS receiver:** `AIS_USE_MOCK=false` + `AIS_TRANSPORT` — see Setup above.

## Exposing the API (ngrok)

To let external testers reach the API without a public deployment:

```powershell
ngrok config add-authtoken <your-token>   # once
ngrok http 3000
```

This prints a public URL (e.g. `https://xxxx.ngrok-free.app`). Share it with testers:

- **`https://xxxx.ngrok-free.app/`** — friendly landing page listing every endpoint.
- **`https://xxxx.ngrok-free.app/api/health`** — live feed status.

Notes:
- Free ngrok shows a **one-time interstitial** ("Visit Site") — normal. Programs should send the header `ngrok-skip-browser-warning: 1` to skip it.
- Your API has **no authentication** — only run the tunnel while testing, and consider `ngrok http 3000 --basic-auth="user:pass"` for a login prompt.
- Stop the tunnel with `Stop-Process -Name ngrok`.

## API documentation (Swagger / OpenAPI)

The REST surface is self-documenting — no more guessing from code:

- **Swagger UI:** `GET /api/docs`
- **Raw OpenAPI JSON:** `GET /api/docs-json` (import into Postman/Insomnia/OpenAPI generators)

Both are generated from the controller decorators, so they always match the running code.

## REST API

All routes are prefixed with `/api`. `GET /` (no prefix) serves the landing page.

### `GET /api/tracks`

**Recommended.** Live snapshot of every tracked object across **all sensor sources** — ADS-B aircraft, Drone Remote ID (URM-01/02), and AIS vessels. Each entry is tagged with its `source`.

| Query param | Description |
| --- | --- |
| `?source=adsb` | ADS-B aircraft only |
| `?source=drone_rid` | Drones only |
| `?source=ais` | AIS vessels only |
| *(omitted)* | Combined, all sources |

### `GET /api/aircraft`

Live snapshot of every tracked aircraft (ADS-B).

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

> Note: aircraft coordinates are exposed as `lat` / `lon` (not `latitude` / `longitude`).

### `GET /api/aircraft/:icao`

Detail for a single aircraft (ICAO in lowercase hex). Returns `404` when the ICAO is not being tracked.

### `GET /api/vessels`

Live snapshot of every tracked AIS vessel. Coordinates are exposed as `latitude` / `longitude`.

```json
{
  "count": 2,
  "vessels": [
    {
      "mmsi": "265505820",
      "name": "SVEA",
      "latitude": 56.732,
      "longitude": 12.014,
      "cog": 198,
      "sog": 11.3,
      "heading": 201,
      "nav_status": 0,
      "ship_type": 70,
      "destination": "GOTHENBURG",
      "stale": false
    }
  ]
}
```

### `GET /api/vessels/:mmsi`

Retrieve details for a specific vessel by its MMSI.

### `GET /api/rid/drones`

Live Remote ID drones currently tracked in memory (URM-01/02). Empty array (`[]`) when no drone is broadcasting — see **Common issues** above for why a silent region produces zero drones.

### `GET /api/rid/stats`

Remote ID ingress pipeline counters and the last raw lines received — invaluable for diagnosing the URM-02 link:

```json
{
  "rawBytes": 100898,
  "rawChunks": 738,
  "jsonLines": 0,
  "nonJsonLines": 0,
  "droneFrames": 3,
  "ignoredFrames": 596,
  "lastRawLine": "{...}",
  "lastIgnoredLine": "{...}",
  "dronesTracked": 1
}
```

- `droneFrames` increments for every decoded `frame_type:3` Remote ID report.
- `ignoredFrames` counts heartbeats/chips you receive (e.g. `frame_type:7`) that aren't drone broadcasts.
- A growing `rawBytes` with `droneFrames: 0` proves the URM-02 feed is live but the drone isn't emitting.

### `GET /api/health`

Liveness + ingress/feed status for **all three sensors**.

```json
{
  "status": "ok",
  "uptimeSeconds": 296.2559584,
  "source": "tcp",
  "trackedAircraft": 8,
  "malformedMessageCount": 0,
  "secondsSinceLastMessage": 0,
  "connectionStatus": "connected",
  "ridSource": "rid_dual",
  "ridConnectionStatus": "connected",
  "ridSecondsSinceLastMessage": 0,
  "trackedDrones": 3,
  "aisSource": "ais_udp",
  "aisConnectionStatus": "connected",
  "aisSecondsSinceLastMessage": 5,
  "trackedVessels": 2
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
| `ridSource` | Drone Remote ID transport kind: `rid_mock`, `rid_udp`, `rid_serial`, `rid_dual` |
| `ridConnectionStatus` | RID transport state |
| `ridSecondsSinceLastMessage` | Seconds since the last RID report (0 = live) |
| `trackedDrones` | Number of drones in the RID store |
| `aisSource` | AIS transport kind: `ais_mock`, `ais_serial`, `ais_tcp`, `ais_udp` |
| `aisConnectionStatus` | AIS transport state |
| `aisSecondsSinceLastMessage` | Seconds since the last AIS message (0 = live) |
| `trackedVessels` | Number of vessels in the AIS store |

### Stored history (`/api/flights/*`)

Requires InfluxDB (see **InfluxDB persistence** below); endpoints return `500` if the DB is unreachable.

**Aircraft:**

| Endpoint | Description |
| --- | --- |
| `GET /api/flights/list?from=&to=&limit=` | Distinct aircraft seen within a time range — `icao`, `first_seen`, `last_seen`, `message_count` |
| `GET /api/flights/positions/:icao?from=&to=` | Full position history for one aircraft — `time`, `icao`, `callsign`, `latitude`, `longitude`, `altitude`, `heading`, `speed`, `vertical_rate`, `squawk`, `position_source`, `on_ground` |
| `GET /api/flights/count` | Total rows stored in `aircraft_positions` |

**Drones:**

| Endpoint | Description |
| --- | --- |
| `GET /api/flights/drones/list?from=&to=&limit=` | Distinct drones seen within a time range — `serial_number`, `first_seen`, `last_seen`, `message_count` |
| `GET /api/flights/drones/positions/:serial?from=&to=` | Full position history for one drone — WGS84 lat/lon, height, altitude, `v_hor`/`v_up`, `uav_type`, pilot (`app_*`) position, envelope fields |
| `GET /api/flights/drones/count` | Total rows stored in `drone_positions` |

**Vessels:**

| Endpoint | Description |
| --- | --- |
| `GET /api/flights/vessels/list?from=&to=&limit=` | Distinct vessels seen within a time range — `mmsi`, `first_seen`, `last_seen`, `message_count` |
| `GET /api/flights/vessels/positions/:mmsi?from=&to=` | Vessel position history |
| `GET /api/flights/vessels/count` | Total rows stored in `vessel_positions` |

## WebSocket

A Socket.IO server runs alongside HTTP at `/socket.io` (namespace `/`). Connect with any Socket.IO client:

```js
import { io } from 'socket.io-client';

// All sources:
const socket = io('http://localhost:3000');
// Only drones (or `?source=adsb` / `?source=ais` for the others):
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
| `track:update` | source-tagged track object | Any decoded message mutates a track (ADS-B aircraft, Drone Remote ID, or AIS vessel) |
| `track:remove` | `{ "source": "...", "id": "...", "at": 1788644257433 }` | A track is evicted after its source's `EVICT_MS` of silence |
| `aircraft:update` | `AircraftState` object | *(legacy)* ADS-B-only broadcast of `track:update` |
| `aircraft:remove` | `{ "icao": "4a0001", "at": 1788644257433 }` | *(legacy)* ADS-B eviction |

```js
socket.on('track:update', (t) => {
  // t.source: "adsb" | "drone_rid" | "ais"
  // adsb: {icao, callsign, lat, lon, altitude, ...}
  // drone_rid: {serial_number, latitude, longitude, height, v_hor, uav_type, ...}
  // ais: {mmsi, name, latitude, longitude, sog, cog, ...}
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
ADSR-800 (RS232, 460800 baud)     URM-02 RID module (UDP 65100 + USB serial)   AIS112E (serial/tcp/udp)
   │  DF17 extended squitter         │  {"frame_type":7|3,...} JSON lines        │  AIVDM NMEA sentences
   ▼                                 ▼                                          ▼
Ingress layer ── transport:         RID ingress ── transport:                  AIS ingress ── transport:
   Serial | Mock | TCP                RidMock|RidUDP|RidSerial|RidDual           AisMock|AisSerial|AisTcp|AisUdp
   │  raw bytes                       │  raw bytes                               │  raw bytes
   ▼                                 ▼                                          ▼
FramingDetector ── Beast/AVR/hex     RidDecoder ── JSON line → DroneRidState    AisDecoder ── AIVDM → VesselState
   │  frames                          │                                          │
   ▼                                 ▼                                          ▼
ModeSDecoder ── CRC24, DF/ICAO,     DroneRidStoreService ── per-serial Map     VesselStoreService ── per-MMSI Map
   AC12 alt, velocity, callsign       (60s eviction, 15s stale, events)         (stale/evict, events)
   │  DecodedMessage{...}             │  handle(drone)                           │  handle(vessel)
   ▼                                 │                                          │
AircraftStoreService ── CprTracker ──┤                                          │
   (60s eviction, 15s stale, events)─┤                                          ▼
   ▼                                 ▼                                      FlightsService
TrackStoreService ─── merges all 3 sources, tags each track with `source`      aircraft_positions / drone_positions /
   │                                                                              vessel_positions (InfluxDB)
   ▼
Serving layer ──── REST (TracksController, AircraftController, RidController, VesselsController, HealthController)
                └─ WebSocket (TracksGateway → Socket.IO)
```

Each sensor (ADS-B, Drone RID, AIS) keeps its own transport + decode + store behind the `DataSource` contract; `TrackStoreService` is the single merged view the API and WebSocket layer read from.

### Module map (NestJS)

```
AppModule ── imports ───────────────────────┐
   ├─ DecodeModule   (src/decode)          ├─ ModeSDecoder (shared, single instance)
   ├─ IngressModule  (src/ingress)         ├─ ADS-B transport factory (serial|tcp|mock)
   ├─ AircraftModule (src/aircraft)        ├─ AircraftStoreService + REST (/api/aircraft)
   ├─ RidModule      (src/rid)             ├─ RID decoder + transports (mock|udp|serial|dual) + store + /api/rid
   ├─ AisModule      (src/ais)             ├─ AIS decoder + transports + store + /api/vessels
   ├─ TracksModule   (src/tracks)          ├─ TrackStoreService + /api/tracks + WebSocket gateway
   ├─ FlightsModule  (src/flights)         ├─ FlightsService (InfluxDB) + /api/flights (aircraft + drone + vessel history)
   ├─ HealthModule   (src/health)          └─ /api/health (own module like every feature)
   └─ RootModule     (src/root)            └─ GET / landing page (excluded from the /api prefix)
```

Each module owns its files and exports only what consumers need. Every sensor
owns its **whole** footprint: ADS-B capture lives in `src/ingress` (transports
+ framing + pipeline) with the live store in `src/aircraft`; Drone Remote ID
keeps **everything** — decoder, transports (`src/rid/transports/`), ingress
pipeline and store — under `src/rid`; AIS lives under `src/ais`. All three
share one byte-stream contract, `src/common/data-source.interface.ts`, injected
via `TRANSPORT_TOKEN` (ADS-B), `RID_TRANSPORT_TOKEN` (drones) and
`AIS_TRANSPORT_TOKEN` (vessels). Global settings live in `src/bootstrap.ts`
(CORS, `/api` prefix, Swagger). Folders mirror the API surface:
`/api/aircraft` → `src/aircraft`, `/api/tracks` → `src/tracks`,
`/api/rid` → `src/rid`, Drone Remote ID ingestion → `src/rid`.

New to the codebase? Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## InfluxDB persistence (in-house, Dockerized)

The live data **continuously saves** into **InfluxDB 2.x**. The API writes every decoded update — ADS-B aircraft, Drone Remote ID reports, and AIS vessels — to three time-series measurements (`aircraft_positions`, `drone_positions`, `vessel_positions`), so history is **never lost on refresh**. No one accesses the database directly — they just use the API, which returns both **realtime** and **stored** data.

- Uses the official **`influxdb:2.7`** Docker image (in-house, no cloud).
- DB layer uses the **official InfluxDB JavaScript client** (`@influxdata/influxdb-client`) — points, tags, bucketed queries via Flux.
- Measurements: `aircraft_positions` (tag `icao`), `drone_positions` (tag `serial_number`), `vessel_positions` (tag `mmsi`).
- Points batch-flush every 5s or every 200 records.
- Persistence is **optional**: with `INFLUX_URL` blank/unreachable the API still serves realtime data; only the `/api/flights/*` history endpoints return `500`.

### Full in-house deployment (API + InfluxDB together)

On the company server (Docker installed), from the repo root:

```bash
# 1. Set credentials + receiver address (see .env.docker.example)
cp .env.docker.example .env
#    edit .env: INFLUX_PASSWORD, INFLUX_TOKEN, TCP_HOST, etc.

# 2. Build & start everything (InfluxDB + API)
docker compose up -d --build
```

The API container starts only after InfluxDB is healthy, then continuously saves incoming data into it. Data persists in the `adsb_influxdb` volume (survives container restarts).

The container receives the Drone RID stream over UDP (`65100/udp`) and AIS datagrams over UDP (`65110/udp`). To pass real USB-serial receivers through to the container (URM-02 Type-C on `/dev/ttyUSB0`, AIS receiver on `/dev/ttyUSB1`), add the `docker-compose.serial.yml` override **only on hosts where the hardware is physically attached** — the base compose intentionally has no `devices:` mapping so `up` never fails on a missing path:

```bash
docker compose -f docker-compose.yml -f docker-compose.serial.yml up -d --build
# Override host device names if different, e.g. RID_HOST_DEVICE=/dev/ttyACM0
```

### Database-only (if the API runs outside Docker)

```bash
docker compose -f docker-compose.db.yml up -d
# then point any API instance at it:
# INFLUX_URL=http://<host>:8086  INFLUX_TOKEN=<token>  INFLUX_ORG=adsb  INFLUX_BUCKET=adsb
```

### Stored / time-series query examples (Flux)

Query InfluxDB directly for analysis (or just use the REST history endpoints):

```flux
// All positions for an aircraft in the last hour
from(bucket: "adsb")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "aircraft_positions" and r.icao == "89630c")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])

// Position count per aircraft today (message_count proxy)
from(bucket: "adsb")
  |> range(start: today())
  |> filter(fn: (r) => r._measurement == "aircraft_positions")
  |> group(columns: ["icao"])
  |> count(column: "_value")
  |> keep(columns: ["icao", "_value"])

// Recent drone reports for a serial (drone_positions measurement)
from(bucket: "adsb")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "drone_positions" and r.serial_number == "A1B2C3D4")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "latitude", "longitude", "height", "v_hor", "uav_type"])
  |> sort(columns: ["_time"])
```