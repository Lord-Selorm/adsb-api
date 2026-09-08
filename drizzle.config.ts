import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/timescale/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Used only by `drizzle-kit push` for dev; set DATABASE_URL to your TimescaleDB.
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/adsb',
  },
});