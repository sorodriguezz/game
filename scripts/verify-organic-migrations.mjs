// Ensayo aditivo/down/up exclusivamente en una base vacía creada por este script.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = requireApi('pg');
const url = new URL(
  process.env.MIGRATION_QA_DATABASE_URL ??
    'postgresql://reinos_dev:reinos_dev_change_me@127.0.0.1:5432/postgres',
);
if (!['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('El ensayo requiere PostgreSQL local');
const name = `reinos_qa_${randomUUID().replaceAll('-', '')}`;
const admin = new Client({ connectionString: url.toString() });
await admin.connect();
let created = false,
  c;
const base = new URL('../packages/db/', import.meta.url);
const tags = JSON.parse(
  readFileSync(new URL('drizzle/meta/_journal.json', base), 'utf8'),
).entries.map((e) => e.tag);
const changed = tags.filter((tag) => Number(tag.slice(0, 4)) >= 4);
const report = {
  at: new Date().toISOString(),
  initial: tags,
  down: [...changed].reverse(),
  up: changed,
  result: 'PENDING',
};
try {
  await admin.query(`create database "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  c = new Client({ connectionString: url.toString() });
  await c.connect();
  for (const tag of tags) await c.query(readFileSync(new URL(`drizzle/${tag}.sql`, base), 'utf8'));
  const schemaSnapshot = async () => ({
    columns: (
      await c.query(
        "select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
      )
    ).rows,
    indexes: (
      await c.query(
        "select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname",
      )
    ).rows,
  });
  const before = JSON.stringify(await schemaSnapshot());
  for (const tag of [...changed].reverse())
    await c.query(readFileSync(new URL(`drizzle-rollback/${tag}.down.sql`, base), 'utf8'));
  for (const tag of changed)
    await c.query(readFileSync(new URL(`drizzle/${tag}.sql`, base), 'utf8'));
  const tables = await c.query(
    "select count(*)::int as n from information_schema.tables where table_schema='public'",
  );
  if (JSON.stringify(await schemaSnapshot()) !== before)
    throw new Error('Columnas o índices difieren tras rollforward');
  report.tables = tables.rows[0].n;
  report.result = 'PASS';
} finally {
  await c?.end();
  if (created) await admin.query(`drop database "${name}"`);
  await admin.end();
  writeFileSync(
    new URL('../docs/requirements/evidence/migration-results.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
