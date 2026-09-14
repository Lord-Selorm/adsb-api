# AIS Support

## Overview

The ADS‑B API now includes a **maritime AIS** data source. AIS vessels are treated as a first‑class `source` just like `adsb` and `drone_rid`. The system maintains a store of vessels, merges them into the unified `/api/tracks` endpoint, and reports health information.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AIS_USE_MOCK` | `true` | When `true` the mock transport supplies synthetic vessel data (no hardware required). Set to `false` to use a real AIS receiver. |
| `AIS_TRANSPORT` | `serial` | Feed transport: `serial` (AIS112E via USB‑RS485), `tcp` (AIS112E behind a serial→Ethernet bridge / AIS112E‑A over TCP/IP), or `udp` (AIS112E‑A network/4G ground station pushing to us). |
| `AIS_SERIAL_PORT` | `COM4` (Windows) / `/dev/ttyUSB1` | Serial port where the AIS NMEA‑0183 stream is available. |
| `AIS_SERIAL_BAUD` | `38400` | Baud rate for the AIS serial connection (AIS112E default: `38400,8,1,N`). |
| `AIS_UDP_HOST` | `0.0.0.0` | Bind address for the AIS UDP listener. |
| `AIS_UDP_PORT` | `65110` | Local UDP port receiving AIVDM datagrams (point the AIS112E‑A web UI here). |
| `AIS_TCP_HOST` | `192.168.0.8` | IP of the TCP serial bridge / AIS TCP server to dial. |
| `AIS_TCP_PORT` | `8236` | TCP port of the AIS feed. |
| `AIS_TCP_RECONNECT_MS` | `1000` | Delay between AIS TCP reconnect attempts. |
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

The AIS112E family ships in two flavors with different data paths:

| Model | Output | How to connect to the API |
|-------|--------|---------------------------|
| **AIS112E** | RS485/RS422 (`38400,8,1,N`) + RJ45 | USB‑RS485 adapter → `AIS_TRANSPORT=serial`; or serial→Ethernet bridge → `AIS_TRANSPORT=tcp` |
| **AIS112E‑A** | 4G / wired Ethernet (TCP/IP or UDP), web UI | `AIS_TRANSPORT=udp` — point the receiver's web UI at this host:UDP (`AIS_UDP_PORT`) or dial-out over TCP |

1. **Connect the AIS receiver** and note the data path (COM port, bridge IP, or UDP destination).
2. **Set the environment variables** before starting the service, for example in PowerShell:
   ```powershell
   $env:AIS_USE_MOCK = 'false'
   $env:AIS_TRANSPORT = 'serial'   # serial | tcp | udp
   $env:AIS_SERIAL_PORT = 'COM5'   # adjust to your port (serial only)
   $env:AIS_SERIAL_BAUD = '38400'  # AIS112E default; most AIS receivers use 38400
   npm run start:dev   # or start:prod
   ```
3. The health endpoint will now report `aisSource` matching your transport (`ais_serial`, `ais_tcp`, or `ais_udp`) and a `connected` status.
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
