import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module.js';

describe('ADS-B API (mock feed)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.USE_MOCK = 'true';
    process.env.MOCK_AIRCRAFT = '3';
    process.env.MOCK_TICK_MS = '200';
    process.env.RECEIVER_LAT = '52';
    process.env.RECEIVER_LON = '4';
    process.env.AIR_STALE_MS = '15000';
    process.env.AIR_EVICT_MS = '60000';

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0);
    // Let the mock emitter produce at least one tick.
    await new Promise((r) => setTimeout(r, 600));
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a health report', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.source).toBe('mock');
  });

  it('lists aircraft from the decoded mock feed', async () => {
    const res = await request(app.getHttpServer()).get('/api/aircraft').expect(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    const aircraft = res.body.aircraft as Array<Record<string, unknown>>;
    expect(aircraft.length).toBe(res.body.count);
    const first = aircraft[0];
    expect(typeof first.icao).toBe('string');
    // Mock aircraft orbit the receiver, so a global position should appear
    // quickly even from the first even/odd pair.
    expect(typeof first.lat).toBe('number');
    expect(typeof first.lon).toBe('number');
    expect(typeof first.callsign).toBe('string');
  });

  it('serves a single aircraft by ICAO', async () => {
    const list = await request(app.getHttpServer()).get('/api/aircraft').expect(200);
    const icao = list.body.aircraft[0].icao as string;
    const res = await request(app.getHttpServer()).get(`/api/aircraft/${icao}`).expect(200);
    expect(res.body.icao).toBe(icao);
    await request(app.getHttpServer()).get('/api/aircraft/ffffff').expect(404);
  });
});