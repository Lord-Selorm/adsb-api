import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module.js';

// Boots the full application with real transports. To keep the spec hermetic
// and non-blocking, the ADS-B ingress is pointed at the serial path (no TCP
// dial-out) and RID/AIS are serial-only (no UDP port binds). Assertions are
// schema-level so the suite passes with or without receivers attached.
describe('ADS-B API (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.TCP_PORT = '0';
    process.env.RID_TRANSPORT = 'serial';
    process.env.AIS_TRANSPORT = 'serial';

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.TCP_PORT;
    delete process.env.RID_TRANSPORT;
    delete process.env.AIS_TRANSPORT;
  });

  it('serves a health report', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.source).toBe('string');
    expect(typeof res.body.trackedAircraft).toBe('number');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('lists tracked aircraft', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/aircraft')
      .expect(200);
    expect(Array.isArray(res.body.aircraft)).toBe(true);
    expect(res.body.count).toBe(res.body.aircraft.length);
    for (const a of res.body.aircraft) {
      expect(typeof a.icao).toBe('string');
    }
  });

  it('serves a single aircraft by ICAO, or 404 when empty', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/aircraft')
      .expect(200);
    if (list.body.aircraft.length > 0) {
      const icao = list.body.aircraft[0].icao as string;
      const res = await request(app.getHttpServer())
        .get(`/api/aircraft/${icao}`)
        .expect(200);
      expect(res.body.icao).toBe(icao);
    }
    await request(app.getHttpServer()).get('/api/aircraft/ffffff').expect(404);
  });

  it('serves a combined /api/tracks view and reports sensor health', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tracks')
      .expect(200);
    expect(Array.isArray(res.body.tracks)).toBe(true);
    for (const t of res.body.tracks) {
      expect(['adsb', 'drone_rid', 'ais']).toContain(t.source);
    }

    const health = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(typeof health.body.ridSource).toBe('string');
    expect(typeof health.body.trackedDrones).toBe('number');
    expect(typeof health.body.aisSource).toBe('string');
    expect(typeof health.body.trackedVessels).toBe('number');
  });
});