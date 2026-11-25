import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const { Pool } = pg;

const useSsl = process.env.PGSSLMODE === 'require' || Boolean(process.env.DATABASE_URL);

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.PGHOST ?? 'localhost',
        port: Number(process.env.PGPORT ?? 5432),
        database: process.env.PGDATABASE ?? 'inventario',
        user: process.env.PGUSER ?? 'postgres',
        password: process.env.PGPASSWORD,
        ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      }
);

pool.on('error', (error) => {
  console.error('Error inesperado en el pool de PostgreSQL:', error);
});
