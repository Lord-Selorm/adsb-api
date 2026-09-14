export interface VesselState {
  mmsi: string;
  name?: string;
  callsign?: string;
  shipType?: number;
  shipTypeDescription?: string;
  latitude?: number;
  longitude?: number;
  sog?: number; // Speed Over Ground (knots)
  cog?: number; // Course Over Ground (degrees)
  heading?: number; // True heading (degrees)
  navStatus?: number;
  navStatusDescription?: string;
  destination?: string;
  draft?: number; // meters
  length?: number; // meters
  width?: number; // meters
  firstSeenAt: number;
  lastUpdatedAt: number;
  stale: boolean;
}

export interface AisPositionReport {
  type: 1 | 2 | 3 | 18;
  mmsi: string;
  navStatus?: number;
  sog?: number;
  longitude?: number;
  latitude?: number;
  cog?: number;
  heading?: number;
  timestamp?: number;
}

export interface AisStaticDataReport {
  type: 5 | 24;
  mmsi: string;
  name?: string;
  callsign?: string;
  shipType?: number;
  destination?: string;
  draft?: number;
  length?: number;
  width?: number;
}

export type DecodedAisMessage = AisPositionReport | AisStaticDataReport;
