# Architecture (read this first)

ADS-B API is a **NestJS** service that turns raw signals from three physical
sensors into a live map of **aircraft, drones and vessels**, served over HTTP +
WebSocket, with optional history saved to InfluxDB.

The golden rule that keeps this codebase easy to navigate:

> **One folder per job. Every file that belongs to a sensor lives next to that
> sensor's own module. Nothing reaches across folders except through the
> `DataSource` contract.**

---

## 1. The pipeline (data flow)

```
ADSR-800 receiver                 URM-02 Drone RID module          AIS112E receiver
(planes, RS232 serial)            (drones, UDP JSON lines)          (vessels, serial/NMEA)
        │                                 │                                 │
        ▼                                 ▼                                 ▼
  src/ingress/                     src/rid/transports/               src/ais/transports/
  (captures bytes)                 (captures bytes)                 (captures bytes)
        │                                 │                                 │
        ▼                                 ▼                                 ▼
  src/decode/                       src/rid/rid.decoder.ts          src/ais/ais.decoder.ts
  (Mode-S -> position)             (JSON line -> drone state)      (AIVDM -> vessel state)
        │                                 │                                 │
        ▼                                 ▼                                 ▼
  src/aircraft/                     src/rid/                         src/ais/
  (live aircraft store)             (live drone store)               (live vessel store)
        │                                 │                                 │
        └───────────────► src/tracks/ ◄───┴─────────────────────────────────┘
        (combined live view)
                 │
                 ▼
        REST  +  WebSocket        +  src/flights/
        (/api/tracks etc.)         (saves history to InfluxDB)
```

Read it as **capture → decode → live store → combined view → serve / save**.

---

## 2. Folder map

```
src/
├── main.ts                    Entry point — starts Nest, handles the port.
├── bootstrap.ts               Global settings: CORS, /api prefix, Swagger.
├── app.module.ts              The only file that "wires everything together".
├── common/                    Shared contracts used by ALL sensors.
│   └── data-source.interface.ts   <The DataSource contract (see below)>
│
├── ingress/                   ADS-B sensor, capture side.
│   ├── ingress.module.ts      Chooses the ADS-B transport from config.
│   ├── ingress.service.ts     bytes -> framing -> Mode-S decode -> store.
│   ├── framing/               Turns raw byte streams into 112-bit frames.
│   └── transports/            serial / tcp / mock implementations.
│
├── decode/                    Mode-S / ADS-B math (shared library).
│   └── mode-s.decoder.ts      Frame → aircraft state (callsign, lat/lon…).
│
├── aircraft/                  ADS-B sensor, live side + REST API.
│   └── aircraft-store.service.ts   In-memory per-ICAO track of every plane.
│
├── rid/                       Drone Remote ID sensor (URM-02), EVERYTHING.
│   ├── rid.module.ts          Wiring + transport choice (mock | UDP | serial | dual).
│   ├── rid.decoder.ts         UDP JSON line → drone state.
│   ├── rid.ingress.service.ts Capture pipeline for the drone feed.
│   ├── drone-rid-store.service.ts  In-memory per-serial drone track.
│   └── transports/            rid-udp / rid-serial / rid-dual + rid-mock (sim).
│
├── ais/                       AIS maritime sensor (AIS112E), EVERYTHING.
│   ├── ais.module.ts          Wiring + transport choice (mock | serial | tcp | udp).
│   ├── ais.decoder.ts         NMEA sentence → vessel state.
│   ├── ais.ingress.service.ts Capture pipeline for the vessel feed.
│   ├── vessel-store.service.ts     In-memory per-MMSI vessel track.
│   └── transports/            ais-serial / ais-tcp / ais-udp + ais-mock (sim).
│
├── tracks/                    The combined live view (planes + drones + vessels).
│   ├── track-store.service.ts Merges aircraft + drone + vessel stores into one feed.
│   ├── tracks.controller.ts   GET /api/tracks.
│   └── tracks.gateway.ts      WebSocket (Socket.IO) live stream.
│
├── flights/                   History persistence (needs INFLUX_* settings).
│   ├── flights.service.ts     Buffers updates → batch-writes to InfluxDB.
│   └── flights.controller.ts  /api/flights/* (aircraft + drone + vessel history).
│
├── health/                    Liveness report — /api/health.
│   └── health.module.ts       Health is a real module like every other feature.
│
├── tools/                     Standalone dev utilities (NOT part of the API).
│   └── viewer/                Live map web page + tiny proxy server.
│
└── docs/                      Human docs (this file lives here).
```

REST routes mirror their folders: `/api/aircraft` → `src/aircraft`,
`/api/tracks` → `src/tracks`, `/api/flights` → `src/flights`.

---

## 3. The `DataSource` contract (key idea)

All three sensors talk into the app through the **same interface**,
`src/common/data-source.interface.ts`:

```ts
interface DataSource {
  kind: 'serial' | 'tcp' | 'udp' | 'mock'
      | 'rid_udp' | 'rid_serial' | 'rid_dual' | 'rid_mock'
      | 'ais_serial' | 'ais_tcp' | 'ais_udp' | 'ais_mock';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(listener: (chunk: Buffer) => void): void;
  onError(listener: (err: Error) => void): void;
  getLastMessageAt(): number;
  getConnectionStatus(): string;
}
```

- **ADS-B signal** → `ingress/transports/*` implement it.
- **Drone RID signal** → `rid/transports/*` implement it.
- **Maritime AIS signal** → `ais/transports/*` implement it.
- Each sensor's module picks the transport from config via an **injection
  token** (`TRANSPORT_TOKEN`, `RID_TRANSPORT_TOKEN`, `AIS_TRANSPORT_TOKEN`) and
  hands it to that sensor's ingress service.

> **Honest scope of adding a new sensor (e.g. weather, radar, second RID
> vendor).** The capture half is genuinely plug-and-play: implement
> `DataSource`, pick it via a `useFactory` in the module, decode into a store.
> BUT the unified view, health, history and API do NOT update themselves. Today
> you must also, by hand:
>
> 1. `src/common/data-source.interface.ts` — extend the `DataSourceKind` union.
> 2. `src/tracks/` — add the store to the merged feed: union, constructor
>    injection, event wiring, a mapper, `getAll()`/`get()` branches, a count
>    getter; plus `tracks.controller.ts`, `tracks.gateway.ts`, `tracks.dto.ts`.
> 3. `src/health/` — import the module + add fields in `health.controller.ts`
>    and `health.dto.ts`.
> 4. `src/flights/` — new measurement + tag + buffer + enqueue + point builder
>    + query methods in `flights.service.ts`, endpoints in
>    `flights.controller.ts`, DTOs in `flights.dto.ts`, subscription in
>    `flights.module.ts`.
> 5. Tests — `src/tracks/track-store.service.spec.ts` and
>    `test/app.e2e-spec.ts` hardcode the source set and must be updated.
>
> That is ~20 files. The pattern is **convention, not enforcement** — nothing
> but discipline stops you forgetting steps 2–5. This is the known weakness of
> the current design; a sensor **registry** that drives tracks/health/flights
> from a single list is the intended fix (see "Adding a sensor" below).

---

## 4. Quick reference: "where do I go to…"

| I want to…                                        | Go here                                        |
| ------------------------------------------------- | ---------------------------------------------- |
| Add a new REST endpoint                            | The controller of the matching folder          |
| Change how planes are turned into tracks           | `src/decode/mode-s.decoder.ts`                 |
| Change radar capture / connection settings        | `src/ingress/transports/*`                     |
| Change drone JSON parsing                          | `src/rid/rid.decoder.ts`                       |
| Change how the URM-02 connects                     | `src/rid/transports/rid-udp.transport.ts`      |
| Add a fake drone or plane for testing              | `src/rid/transports/rid-mock.transport.ts` / `src/ingress/transports/mock.transport.ts` |
| Add fields to the live feed (`/api/tracks`)        | `src/tracks/` + the store of that sensor       |
| Change what `/api/health` reports                  | `src/health/health.controller.ts`              |
| Change database tables / queries                   | `src/flights/flights.service.ts`             |
| Change CORS or the `/api` prefix                   | `src/bootstrap.ts`                             |
| Add a health field for a new sensor                | Implement `DataSource` + register the module in `src/health/health.module.ts`, then add fields in `health.controller.ts` + `health.dto.ts` |

---

## 5. Conventions

- **One module per feature**, and each module declares only what it owns.
  `app.module.ts` never contains logic — it only imports feature modules.
- **Everything a sensor owns stays in its folder** — including its transports.
  That's why `rid/transports/` exists (Drone RID) and `ingress/transports/`
  (ADS-B): you never cross folders to find where a sensor lives.
- **Shared things live in `src/common/`** (the `DataSource` contract is shared by
  all three sensors — that's why it's not in `ingress/`).
- **Injection tokens** name their owner: `TRANSPORT_TOKEN` (ADS-B),
  `RID_TRANSPORT_TOKEN` (drones), `AIS_TRANSPORT_TOKEN` (vessels) — keep this
  `X_TRANSPORT_TOKEN` naming for future sensors.
- Imports use **`.js` suffixes** (ESM) — a relative import in this repo always
  ends in `.js` even though the file is TypeScript.
- **Tests sit next to the code they test** (`*.spec.ts` beside the source);
  heavier integration tests live in `test/`.

---

## 6. Running it

```powershell
npm install
npm run build          # compile
npm run start:prod     # start API (http://localhost:3000)

# Tests
npm test               # unit tests
npm run test:e2e       # end-to-end route tests
npm run lint           # oxlint
```

## 7. The live viewer (tools/viewer)

A zero-dependency page showing all three live feeds + a device reachability
check. It proxies `/api/*` to the API, so it works from any machine that can
reach the API (including through ngrok).

```powershell
# from the repo root
node tools/viewer/viewer-server.mjs
# open http://127.0.0.1:5173
```

Env overrides: `VIEWER_PORT` (default 5173), `API_URL` (default
`http://127.0.0.1:3000`).