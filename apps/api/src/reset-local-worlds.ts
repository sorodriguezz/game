/** Ejecutar exclusivamente para el reinicio local solicitado por el propietario. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase, requireDatabaseUrl, accounts } from '@reinos/db';
import { AdministrationService, systemClock, silentLogger } from '@reinos/core';
import { eq } from 'drizzle-orm';
const url = requireDatabaseUrl(),
  parsed = new URL(url);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/reinos_dev')
  throw new Error('Operación limitada a reinos_dev local');
const database = createDatabase(url, { max: 2 }),
  client = await database.pool.connect();
try {
  const old = await client.query<{ id: string; slug: string }>(
    'select id,slug from worlds order by id',
  );
  const allowed = new Set(['reinos-terrestres', 'frontera-1', 'prueba-rapida', 'reinos-organicos']);
  if (old.rows.some((w) => !allowed.has(w.slug)))
    throw new Error(
      'Existe un mundo distinto de los cuatro anteriores; no se borra automáticamente',
    );
  if (old.rows.length !== 4)
    throw new Error('Se esperaban exactamente los cuatro mundos verificados');
  const directory = fileURLToPath(new URL('../../../.local/backups/', import.meta.url));
  mkdirSync(directory, { recursive: true });
  const file = `${directory}before-world-reset-${Date.now()}.json`;
  await client.query('begin isolation level repeatable read read only');
  const tables = (
    await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    )
  ).rows.map((t) => t.tablename);
  const data: Record<string, unknown[]> = {};
  for (const t of tables)
    data[t] = (await client.query(`select * from "${t.replaceAll('"', '""')}"`)).rows;
  await client.query('commit');
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      database: parsed.pathname,
      tables: data,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { tables: Record<string, unknown[]> };
  if (Object.keys(saved.tables).length !== tables.length || saved.tables.worlds?.length !== 4)
    throw new Error('No se verificó el respaldo');
  console.log(`Respaldo verificado: ${file} (${tables.length} tablas)`);
  const scoped = (
    await client.query<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema='public' and column_name='world_id'",
    )
  ).rows.map((t) => t.table_name);
  const foreign = (
    await client.query<{ child: string; parent: string }>(
      "select conrelid::regclass::text as child,confrelid::regclass::text as parent from pg_constraint where contype='f' and connamespace='public'::regnamespace",
    )
  ).rows;
  const pending = new Set(scoped),
    order: string[] = [];
  while (pending.size) {
    const leaf = [...pending].find(
      (t) => !foreign.some((f) => f.parent === t && f.child !== t && pending.has(f.child)),
    );
    if (!leaf) throw new Error('Dependencias cíclicas: no se elimina nada');
    order.push(leaf);
    pending.delete(leaf);
  }
  await client.query('begin');
  await client.query('select id from worlds where id=any($1::uuid[]) order by id for update', [
    old.rows.map((w) => w.id),
  ]);
  for (const t of order)
    await client.query(`delete from "${t.replaceAll('"', '""')}" where world_id=any($1::uuid[])`, [
      old.rows.map((w) => w.id),
    ]);
  await client.query('delete from worlds where id=any($1::uuid[])', [old.rows.map((w) => w.id)]);
  await client.query('commit');
  const [admin] = await database.db
    .select()
    .from(accounts)
    .where(eq(accounts.email, 'administrador@reinos.local'));
  if (!admin || admin.role !== 'ADMIN') throw new Error('Falta administrador');
  const svc = new AdministrationService({ db: database.db, clock: systemClock, log: silentLogger }),
    now = new Date();
  const world = await svc.createWorld(
    admin.id,
    {
      name: 'Tierras de la Frontera',
      description: 'Una nueva temporada para fundar, comerciar y conquistar.',
      mapSize: 1000,
      speedMultiplier: 5,
      movementSpeedMultiplier: 1,
      mapSeed: 20261105,
      protectionHours: 72,
      opensAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 90 * 86400000).toISOString(),
    },
    randomUUID(),
  );
  await svc.worldAction(admin.id, world.id, 'PUBLISH', randomUUID());
  console.log(`Único mundo creado y publicado por Administrador: ${world.name}`);
} catch (e) {
  await client.query('rollback').catch(() => {});
  throw e;
} finally {
  client.release();
  await database.close();
}
