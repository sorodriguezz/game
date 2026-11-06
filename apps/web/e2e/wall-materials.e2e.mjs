// Escenarios visuales exclusivamente en reinos_test; no modifica el mundo de desarrollo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const require = createRequire(new URL('../../api/package.json', import.meta.url)),
  { Client } = require('pg');
const db = new Client({
  connectionString: 'postgresql://reinos_dev:reinos_dev_change_me@127.0.0.1:5432/reinos_test',
});
await db.connect();
assert.equal((await db.query('select current_database() as n')).rows[0].n, 'reinos_test');
const base = 'http://127.0.0.1:5174',
  out = fileURLToPath(new URL('../../../docs/requirements/evidence/', import.meta.url)),
  results = [];
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({
    channel,
    headless: true,
    args: ['--ignore-gpu-blocklist'],
  });
  try {
    for (const [civilization, label, material] of [
      ['stone_wardens', 'romanos', 'STONE'],
      ['forest_kin', 'galos', 'WOOD'],
      ['steppe_clans', 'germanos', 'EARTH'],
    ]) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } }),
        page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('response', (r) => {
        if (r.status() >= 400 && r.url().includes('/assets/'))
          errors.push(`Asset ${r.status()} ${r.url()}`);
      });
      try {
        const name = `Mur${Date.now().toString(36)}`;
        const registration = await context.request.post(`${base}/api/v1/auth/register`, {
          data: {
            email: `${name}@example.test`,
            displayName: name,
            password: 'qa-local-password-12345',
          },
        });
        assert.equal(registration.status(), 201);
        const me = await registration.json();
        const world = (await (await context.request.get(`${base}/api/v1/worlds`)).json())[0];
        const joined = await context.request.post(`${base}/api/v1/worlds/${world.id}/join`, {
          headers: { 'x-csrf-token': me.csrfToken, 'idempotency-key': crypto.randomUUID() },
          data: {
            civilization,
            villageName: `Ciudad de ${label}`,
            characterName: name,
            quadrant: 'NW',
          },
        });
        assert.equal(joined.status(), 201);
        const { villageId } = await joined.json();
        const layout = (
          await db.query('select layout from village_layouts where village_id=$1', [villageId])
        ).rows[0].layout;
        for (const [plot, type] of [
          [19, 'wall'],
          [20, 'middle_wall'],
          [21, 'inner_wall'],
        ])
          await db.query(
            'insert into village_buildings(world_id,village_id,plot,type,level) values($1,$2,$3,$4,10)',
            [world.id, villageId, plot, type],
          );
        // Campos de nivel variado y edificios compatibles con su recinto para revisar calles/huellas.
        let n = 0;
        const used = new Set(['city_hall', 'wall', 'middle_wall', 'inner_wall']);
        const choices = [
          'warehouse',
          'granary',
          'barracks',
          'stable',
          'workshop',
          'lumber_mill',
          'brickyard',
          'iron_foundry',
          'grain_mill',
          'bakery',
          'hospital',
          'market',
          'academy',
          'smithy',
          'castle',
          'rally_point',
          'embassy',
          'town_hall',
          'treasury',
        ];
        for (const plot of layout.plots) {
          if ([0, 19, 20, 21].includes(plot.id)) continue;
          const type =
            plot.kind === 'field'
              ? plot.allowedTypes[0]
              : choices.find((type) => !used.has(type) && (plot.allowedTypes?plot.allowedTypes.includes(type):plot.kind==='industry'&&!['castle','rally_point','embassy','town_hall','treasury'].includes(type)));
          if (!type) continue;
          used.add(type);
          await db.query(
            'insert into village_buildings(world_id,village_id,plot,type,level) values($1,$2,$3,$4,$5)',
            [world.id, villageId, plot.id, type, 3 + (n++ % 6)],
          );
        }
        await db.query(
          "insert into troop_stacks(world_id,village_id,unit_type,quantity) values($1,$2,'militia',32),($1,$2,'spearman',14)",
          [world.id, villageId],
        );
        const view = await (
          await context.request.get(`${base}/api/v1/worlds/${world.id}/villages/${villageId}`)
        ).json();
        assert.ok(view.walls.every((w) => w.material === material && w.level === 10));
        await page.goto(`${base}/#/w/${world.id}/v/${villageId}`);
        await page.getByRole('button', { name: 'Mi aldea 3D' }).click();
        await page.waitForFunction(
          () => window.__reinosPerf?.snapshot('city')?.frames > 100,
          null,
          { timeout: 60000 },
        );
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${out}/${channel}-${label}-walls.png` });
        const perf = await page.evaluate(() => window.__reinosPerf?.snapshot('city'));
        assert.equal(await page.locator('.city-level').count(), 52);
        assert.ok(
          await page.getByLabel('Ejército y ataques de la aldea', { exact: true }).isVisible(),
        );
        assert.deepEqual(errors, []);
        results.push({
          channel,
          civilization,
          material,
          layout: layout.version,
          visibleLevels: 52,
          metrics: perf,
          errors,
        });
        console.log(`${channel} ${label}: material y escena verificados`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
await db.end();
writeFileSync(`${out}/wall-browser-results.json`, JSON.stringify(results, null, 2));
