// Where accounts and their heroes are kept.
// With DATABASE_URL set (for example a free Neon Postgres), everything lives in the database
// and survives server restarts. Without it, a file in ./data is used (fine for playing at home).
import fs from 'node:fs';
import path from 'node:path';

export async function makeStore({ databaseUrl, dataDir }) {
  const cache = new Map();   // key -> account
  const dirty = new Set();

  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 4, ssl: local ? false : (/sslmode=/.test(databaseUrl) ? undefined : { rejectUnauthorized: false }) });
    pool.on('error', (e) => console.error('Database error:', e.message));
    await pool.query('CREATE TABLE IF NOT EXISTS duskhold_accounts (name TEXT PRIMARY KEY, data JSONB NOT NULL, updated TIMESTAMPTZ NOT NULL DEFAULT now())');
    const flush = async () => {
      const keys = [...dirty]; dirty.clear();
      for (const k of keys) {
        const acc = cache.get(k); if (!acc) continue;
        try {
          await pool.query('INSERT INTO duskhold_accounts (name, data, updated) VALUES ($1, $2, now()) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated = now()', [k, acc]);
        } catch (e) { console.error('Could not save account', k, e.message); dirty.add(k); }
      }
    };
    return {
      kind: 'database',
      async get(key) {
        if (cache.has(key)) return cache.get(key);
        const r = await pool.query('SELECT data FROM duskhold_accounts WHERE name = $1', [key]);
        const acc = r.rows[0] ? r.rows[0].data : null;
        if (acc) cache.set(key, acc);
        return acc;
      },
      put(acc) { cache.set(acc.key, acc); dirty.add(acc.key); },
      flush,
      async close() { await flush(); await pool.end(); },
    };
  }

  // file store
  const file = path.join(dataDir, 'accounts.json');
  try { const all = JSON.parse(fs.readFileSync(file, 'utf8')); for (const k in all) cache.set(k, all[k]); } catch { /* first run */ }
  const flush = async () => {
    if (!dirty.size) return;
    dirty.clear();
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(Object.fromEntries(cache)));
      fs.renameSync(file + '.tmp', file);
    } catch (e) { console.error('Could not write accounts:', e.message); }
  };
  return {
    kind: 'file',
    async get(key) { return cache.get(key) || null; },
    put(acc) { cache.set(acc.key, acc); dirty.add(acc.key); },
    flush,
    async close() { await flush(); },
  };
}
