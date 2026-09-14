import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so routes are tested under the real /api prefix.
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/health (GET) reports an ok service backed by the mock feed', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.source).toBe('mock');
    expect(typeof res.body.trackedAircraft).toBe('number');
  });

  it('/api/aircraft (GET) returns a snapshot', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/aircraft')
      .expect(200);
    expect(Array.isArray(res.body.aircraft)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });

  it('/api/tracks (GET) returns a combined snapshot with source tags', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tracks')
      .expect(200);
    expect(Array.isArray(res.body.tracks)).toBe(true);
    expect(typeof res.body.count).toBe('number');
    for (const t of res.body.tracks) {
      expect(['adsb', 'drone_rid', 'ais']).toContain(t.source);
    }
  });

  it('/api/tracks?source=drone_rid (GET) filters by source', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tracks?source=drone_rid')
      .expect(200);
    for (const t of res.body.tracks) {
      expect(t.source).toBe('drone_rid');
    }
  });

  it('/api/tracks?source=ais (GET) filters by source', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tracks?source=ais')
      .expect(200);
    for (const t of res.body.tracks) {
      expect(t.source).toBe('ais');
    }
  });

  it('/api/tracks?source=unknown (GET) rejects unknown sources', async () => {
    await request(app.getHttpServer())
      .get('/api/tracks?source=unknown')
      .expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
