# AIS Support

## Overview

The ADS‑B API now includes a **maritime AIS** data source. AIS vessels are treated as a first‑class `source` just like `adsb` and `drone_rid`. The system maintains a store of vessels, merges them into the unified `/api/tracks` endpoint, and reports health information.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AIS_USE_MOCK` | `true` | When `true` the mock transport supplies synthetic vessel data (no hardware required). Set to `false` to use a real AIS receiver. |
| `AIS_SERIAL_PORT` | `COM4` (Windows) | Serial port where the AIS NMEA‑0183 stream is available. |
| `AIS_SERIAL_BAUD` | `38400` | Baud rate for the AIS serial connection. |
| `AIS_MOCK_TICK_MS` | `2000` | Interval (ms) at which the mock transport emits position/static reports. |
| `AIS_STALE_MS` | `300000` | How long a vessel can be silent before being marked `stale`. |
| `AIS_EVICT_MS` | `1800000` | How long a stale vessel stays in the store before removal. |

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/tracks?source=ais` | ✅ | Returns live AIS vessel tracks (same shape as ADS‑B & RID). |
| `GET /api/vessels` | ✅ | List all vessels (shortcut for `source=ais`). |
| `GET /api/vessels/:mmsi` | ✅ | Details for a single vessel. |
| `GET /api/health` | ✅ | New fields `aisSource`, `aisConnectionStatus`, `aisSecondsSinceLastMessage`, `trackedVessels`. |

## Running with real AIS hardware

1. **Connect the AIS receiver** (e.g., a USB‑serial AIS dongle) and note the COM port.
2. **Set the environment variables** before starting the service, for example in PowerShell:
   ```powershell
   $env:AIS_USE_MOCK = 'false'
   $env:AIS_SERIAL_PORT = 'COM5'   # adjust to your port
   $env:AIS_SERIAL_BAUD = '38400'  # most AIS receivers use 38400
   npm run start:dev   # or start:prod
   ```
3. The health endpoint will now report `aisSource: "ais_serial"` and a `connected` status.
4. Verify data via:
   ```powershell
   Invoke-RestMethod http://localhost:3000/api/vessels
   ```
   You should see real vessel positions streamed from the receiver.

## Development & testing

When `AIS_USE_MOCK=true` (the default) the mock transport generates four vessels that move slowly around the configured centre latitude/longitude (`RECEIVER_LAT` / `RECEIVER_LON`). This is useful for CI pipelines and local development without any hardware.

The Docker deployment (`docker-compose.yml`) publishes the RID UDP port and ships a `docker-compose.serial.yml` override for USB-serial passthrough (`/dev/ttyUSB0` for the URM-02, `/dev/ttyUSB1` for the AIS receiver on Linux hosts).

---

*The documentation is deliberately kept in the `docs/` folder so the main README stays focused on the core ADS‑B functionality. The link to this file can be added to the main README if desired.*
