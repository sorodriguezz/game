// QA sobre cuentas nuevas en un mundo LOCAL de prueba. Nunca modifica cuentas previas.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const { Client } = requireApi('pg');
const base = process.env.E2E_BASE ?? 'http://localhost:5173';
const dbUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql://reinos_dev:reinos_dev_change_me@127.0.0.1:5432/reinos_dev';
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost):/.test(base) ||
  !/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(dbUrl)
)
  throw new Error('QA solo local');
const out = fileURLToPath(new URL('../../../docs/requirements/evidence/', import.meta.url));
mkdirSync(out, { recursive: true });
const db = new Client({ connectionString: dbUrl });
await db.connect();
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 45000) => {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await sleep(250);
  }
};
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({
    channel,
    headless: true,
    args: ['--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    const run = Date.now().toString(36),
      name = `Urb${run}`;
    const registered = await context.request.post(`${base}/api/v1/auth/register`, {
      data: {
        email: `${name}@example.test`,
        displayName: name,
        password: 'qa-local-password-12345',
      },
    });
    assert.equal(registered.status(), 201);
    const me = await registered.json();
    const ws = await (await context.request.get(`${base}/api/v1/worlds`)).json(),
      world = ws.find((w) => w.rulesetVersion === 'frontier-alpha.2');
    assert.ok(world && world.profile === 'test');
    const joined = await context.request.post(`${base}/api/v1/worlds/${world.id}/join`, {
      headers: { 'x-csrf-token': me.csrfToken, 'idempotency-key': crypto.randomUUID() },
      data: { civilization: 'stone_wardens', villageName: `Ciudad ${run}` },
    });
    assert.equal(joined.status(), 201);
    const { villageId } = await joined.json();
    for (const [plot, type] of [
      [19, 'wall'],
      [20, 'middle_wall'],
      [21, 'inner_wall'],
    ])
      await db.query(
        'insert into village_buildings(world_id,village_id,plot,type,level) values($1,$2,$3,$4,5) on conflict(village_id,plot) do update set level=5',
        [world.id, villageId, plot, type],
      );
    await db.query(
      'update wall_sections set integrity=case precinct when 3 then 450 when 2 then 750 else 1000 end where world_id=$1 and village_id=$2',
      [world.id, villageId],
    );
    await page.goto(`${base}/#/w/${world.id}/v/${villageId}`);
    await page.getByRole('button', { name: 'Mi aldea 3D' }).click();
    await page.waitForFunction(() => window.__reinosPerf?.snapshot('city')?.frames > 60, null, {
      timeout: 60000,
    });
    assert.equal(await page.locator('.wall-card').count(), 3);
    const viewBefore = await (
      await context.request.get(`${base}/api/v1/worlds/${world.id}/villages/${villageId}`)
    ).json();
    const layout = JSON.stringify(viewBefore.layout);
    await page.evaluate(() => window.__reinosPerf.reset('city'));
    await sleep(3000);
    const perf = await page.evaluate(() => window.__reinosPerf.snapshot('city'));
    await page.screenshot({ path: `${out}/${channel}-city.png`, timeout: 60000 });
    await page
      .locator('.wall-card')
      .filter({ hasText: 'Recinto productivo' })
      .getByRole('button', { name: 'Reparar muralla' })
      .click();
    await page.getByText('Reparación iniciada', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Distrito productivo 4', exact: true }).click();
    await page.getByLabel('Catálogo de construcción').selectOption('barracks');
    await page.getByRole('button', { name: 'Confirmar construcción', exact: true }).click();
    await page.getByText('Obra iniciada: nivel 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Campos', exact: true }).click();
    await page.getByRole('button', { name: 'Mejorar', exact: true }).click();
    await page.getByText('Obra iniciada: nivel 2', { exact: true }).waitFor();
    const doubleQueue = await (
      await context.request.get(`${base}/api/v1/worlds/${world.id}/villages/${villageId}`)
    ).json();
    assert.equal(doubleQueue.constructions.length, 2);
    await page
      .locator('.realm-sidebar')
      .getByRole('button', { name: /Ejército/ })
      .click();
    await page.getByLabel('Doctrina por recintos').selectOption('CORE');
    await page.getByRole('button', { name: 'Guardar doctrina', exact: true }).click();
    await page.getByText('Doctrina defensiva guardada', { exact: true }).waitFor();
    const current = await (
      await context.request.get(`${base}/api/v1/worlds/${world.id}/villages/${villageId}`)
    ).json();
    assert.equal(current.doctrine.deployment, 'CORE');
    assert.equal(JSON.stringify(current.layout), layout);
    // Segundo jugador: el worker resuelve un asedio real sin abrir la defensa.
    const opponent = await browser.newContext();
    const oppName = `Atk${run}`;
    const reg = await opponent.request.post(`${base}/api/v1/auth/register`, {
      data: {
        email: `${oppName}@example.test`,
        displayName: oppName,
        password: 'qa-local-password-12345',
      },
    });
    const om = await reg.json();
    const j = await opponent.request.post(`${base}/api/v1/worlds/${world.id}/join`, {
      headers: { 'x-csrf-token': om.csrfToken, 'idempotency-key': crypto.randomUUID() },
      data: { civilization: 'steppe_clans', villageName: `Ejército ${run}` },
    });
    assert.equal(j.status(), 201);
    const source = (await j.json()).villageId;
    for (const [unit, quantity] of [
      ['militia', 1000],
      ['ram', 30],
    ])
      await db.query(
        'insert into troop_stacks(world_id,village_id,unit_type,quantity) values($1,$2,$3,$4)',
        [world.id, source, unit, quantity],
      );
    const m = await opponent.request.post(
      `${base}/api/v1/worlds/${world.id}/villages/${source}/movements`,
      {
        headers: { 'x-csrf-token': om.csrfToken, 'idempotency-key': crypto.randomUUID() },
        data: {
          targetVillageId: villageId,
          mission: 'ATTACK',
          units: [
            { unitType: 'militia', quantity: 1000 },
            { unitType: 'ram', quantity: 30 },
          ],
        },
      },
    );
    assert.equal(m.status(), 201);
    const march = await m.json();
    // Solo la fixture local adelanta este viaje para no esperar horas de reloj real.
    await db.query("update army_movements set arrives_at=now()+interval '2 seconds' where id=$1", [
      march.movementId,
    ]);
    await db.query(
      "update scheduled_events set due_at=now()+interval '2 seconds',available_at=now()+interval '2 seconds' where world_id=$1 and dedupe_key=$2",
      [world.id, `arrival:${march.movementId}`],
    );
    await until(
      async () =>
        (await db.query('select id from battles where movement_id=$1', [march.movementId]))
          .rowCount === 1,
    );
    await page
      .locator('.realm-sidebar')
      .getByRole('button', { name: /Informes/ })
      .click();
    await page.locator('.reports .link').first().click();
    await page.getByRole('heading', { name: 'Desarrollo por recintos' }).waitFor();
    await page.getByRole('button', { name: 'Ver recreación', exact: true }).click();
    await page.waitForFunction(() => window.__reinosPerf?.snapshot('city')?.frames > 60, null, {
      timeout: 60000,
    });
    await page.getByRole('button', { name: 'Saltar al resultado', exact: true }).click();
    await page.getByRole('button', { name: 'Repetir', exact: true }).click();
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await page.getByRole('button', { name: 'Saltar al resultado', exact: true }).click();
    await page.screenshot({ path: `${out}/${channel}-report.png`, timeout: 60000 });
    await page.getByRole('button', { name: 'Mi aldea 3D' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(1500);
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    assert.ok(widths.document <= widths.viewport + 1);
    await page.screenshot({ path: `${out}/${channel}-mobile.png`, fullPage: true, timeout: 60000 });
    assert.deepEqual(errors, []);
    results.push({
      channel,
      version: browser.version(),
      worldId: world.id,
      villageId,
      perf,
      widths,
      consoleErrors: errors,
      checks: [
        '3 muros',
        'plano estable',
        'reparación',
        'catálogo y confirmación',
        'doctrina',
        'asedio offline',
        'informe y recreación',
        '390px',
      ],
    });
    await opponent.close();
  } finally {
    await browser.close();
    writeFileSync(`${out}/browser-results.json`, JSON.stringify(results, null, 2));
  }
}
await db.end();
console.log(JSON.stringify(results, null, 2));
