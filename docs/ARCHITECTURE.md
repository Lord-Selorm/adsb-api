# Architecture (read this first)

ADS-B API is a **NestJS** service that turns raw signals from two physical
sensors into a live map of planes and drones, served over HTTP + WebSocket,
with optional history saved to TimescaleDB.

The golden rule that keeps this codebase easy to navigate:

> **One folder per job. Every file that belongs to a sensor lives next to that
> sensor's own module. Nothing reaches across folders except through the
> `DataSource` contract.**

---

## 1. The pipeline (data flow)

```
ADSR-800 receiver                 URM-02 Drone RID module
(planes, RS232 serial)            (drones, UDP JSON lines)
        │                                 │
        ▼                                 ▼
  src/ingress/                     src/rid/transports/
  (captures bytes)                 (captures bytes)
        │                                 │
        ▼                                 ▼
  src/decode/                       src/rid/rid.decoder.ts
  (Mode-S -> position)             (JSON line -> drone state)
        │                                 │
        ▼                                 ▼
  src/aircraft/                     src/rid/
  (live aircraft store)             (live drone store)
        │                                 │
        └─────────────► src/tracks/ ◄─────┘
        (combined live view)
                 │
                 ▼
        REST  +  WebSocket        +  src/flights/
        (/api/tracks etc.)         (saves history to TimescaleDB)
```

Read it as **capture → decode → live store → combined view → serve / save**.

---

## 2. Folder map

```
src/
├── main.ts                    Entry point — starts Nest, handles the port.
├── bootstrap.ts               Global settings: CORS, /api prefix, Swagger.
├── app.module.ts              The only file that "wires everything together".
├── common/                    Shared contracts used by BOTH sensors.
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
│   ├── rid.module.ts          Wiring + transport choice (mock | UDP).
│   ├── rid.decoder.ts         UDP JSON line → drone state.
│   ├── rid.ingress.service.ts Capture pipeline for the drone feed.
│   ├── drone-rid-store.service.ts  In-memory per-serial drone track.
│   └── transports/            rid-udp (physical module) + rid-mock (sim).
│
├── tracks/                    The combined live view (planes + drones).
│   ├── track-store.service.ts Merges aircraft + drone stores into one feed.
│   ├── tracks.controller.ts   GET /api/tracks.
│   └── tracks.gateway.ts      WebSocket (Socket.IO) live stream.
│
├── flights/                   History persistence (needs DATABASE_URL).
│   ├── flights.service.ts     Buffers updates → batch-writes to TimescaleDB.
│   ├── schema.ts              Drizzle table definitions.
│   └── flights.controller.ts  /api/flights/* (aircraft + drone history).
│
├── health/                    Liveness report — /api/health.
│   └── health.module.ts       Health is a real module like every other feature.
│
└── docs/                      Human docs (this file lives here).
```

REST routes mirror their folders: `/api/aircraft` → `src/aircraft`,
`/api/tracks` → `src/tracks`, `/api/flights` → `src/flights`.

---

## 3. The `DataSource` contract (key idea)

Both sensors talk into the app through the **same interface**,
`src/common/data-source.interface.ts`:

```ts
interface DataSource {
  kind: 'serial' | 'tcp' | 'udp' | 'mock' | 'rid_udp' | 'rid_mock';
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
- The health check just reads these two implementations via their
  **injection tokens** (`TRANSPORT_TOKEN` for ADS-B, `RID_TRANSPORT_TOKEN` for
  drones).

That means: to add a **third sensor** (say AIS ships), you create
`src/ais/` with its own `transports/` + `decode` + `store`, implement
`DataSource`, and drop it into `src/ais/ais.module.ts`. Nothing downstream
changes.

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
| Change database tables / queries                   | `src/flights/schema.ts` + `src/flights/flights.service.ts` |
| Change CORS or the `/api` prefix                   | `src/bootstrap.ts`                             |
| Add a health field for a new sensor                | Implement `DataSource`, then add it to `src/health/health.controller.ts` |

---

## 5. Conventions

- **One module per feature**, and each module declares only what it owns.
  `app.module.ts` never contains logic — it only imports feature modules.
- **Everything a sensor owns stays in its folder** — including its transports.
  That's why `rid/transports/` exists (Drone RID) and `ingress/transports/`
  (ADS-B): you never cross folders to find where a sensor lives.
- **Shared things live in `src/common/`** (the `DataSource` contract is shared by
  both sensors — that's why it's not in `ingress/`).
- **Injection tokens** name their owner: `TRANSPORT_TOKEN` (ADS-B),
  `RID_TRANSPORT_TOKEN` (drones).
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