import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const require = createRequire(new URL('../../api/package.json', import.meta.url)),
  { Client } = require('pg'),
  db = new Client({
    connectionString: 'postgresql://reinos_dev:reinos_dev_change_me@127.0.0.1:5432/reinos_test',
  });
await db.connect();
assert.equal((await db.query('select current_database() as name')).rows[0].name, 'reinos_test');
const base = 'http://127.0.0.1:5174',
  out = fileURLToPath(new URL('../../../docs/requirements/evidence/', import.meta.url));
mkdirSync(out, { recursive: true });
const results = [];
for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({
      channel,
      headless: true,
      args: ['--ignore-gpu-blocklist'],
    }),
    context = await browser.newContext({ viewport: { width: 1600, height: 1050 } }),
    page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(base);
    await page.getByLabel('Usuario o correo').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Administrador', exact: true }).count(), 0);
    const widths = await page.locator('.auth-card input').evaluateAll((inputs) =>
      inputs.map((i) => ({
        w: i.getBoundingClientRect().width,
        bg: window.getComputedStyle(i).backgroundColor,
      })),
    );
    assert.equal(widths[0].w, widths[1].w);
    assert.equal(widths[0].bg, widths[1].bg);
    await page.screenshot({ path: `${out}/${channel}-login.png` });
    await page.getByLabel('Usuario o correo').fill('QAAdministrador');
    await page.getByLabel('Contraseña', { exact: true }).fill('qa-local-password-12345');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('heading', { name: 'Mundos y temporadas' }).waitFor();
    assert.equal(await page.locator('.managed-world').count(), 1);
    await page.screenshot({ path: `${out}/${channel}-admin.png` });
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await page.getByLabel('Usuario o correo').fill('QAModerador');
    await page.getByLabel('Contraseña', { exact: true }).fill('qa-local-password-12345');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('heading', { name: 'Mundos asignados' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Crear mundo', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    const run = Date.now().toString(36),
      username = `Vista${run}`;
    const reg = await context.request.post(`${base}/api/v1/auth/register`, {
      data: {
        email: `${username}@example.test`,
        displayName: username,
        password: 'qa-local-password-12345',
      },
    });
    assert.equal(reg.status(), 201);
    const me = await reg.json();
    await page.goto(base);
    await page.getByRole('button', { name: 'Unirse', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Entrenamiento táctico/ }).count(), 0);
    assert.equal(await page.locator('article.world').count(), 1);
    assert.equal(
      await page
        .locator('.badge')
        .filter({ hasText: /prueba|alpha/ })
        .count(),
      0,
    );
    await page.getByRole('button', { name: 'Unirse', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: `${out}/${channel}-join-tribe.png` });
    await page.getByRole('button', { name: 'Siguiente →', exact: true }).click();
    await page.locator('.map-loading').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /Suroeste/ }).click();
    await page.screenshot({ path: `${out}/${channel}-join-quadrant.png` });
    await page.getByRole('button', { name: 'Siguiente →', exact: true }).click();
    await page.getByLabel('Nombre del personaje en este mundo').fill(`Gob${run}`);
    await page.getByLabel('Nombre de tu aldea').fill(`Capital ${run}`);
    await page.getByRole('button', { name: 'Fundar aldea', exact: true }).click();
    await page.locator('.cartesian-world').waitFor({ timeout: 45000 });
    const worlds = await (await context.request.get(`${base}/api/v1/worlds`)).json(),
      world = worlds[0],
      villageId = world.membership.villageIds[0],
      url = `${base}/api/v1/worlds/${world.id}/villages/${villageId}`;
    const view = await (await context.request.get(url)).json();
    assert.ok(view.x < 0 && view.y < 0);
    assert.equal(view.buildings.length, 1);
    assert.equal(view.buildings[0].type, 'city_hall');
    assert.equal(view.layout.plots.length, 52);
    assert.equal(view.population.inhabitants, 2);
    await page.waitForFunction(
      () => Number(document.querySelector('.cartesian-world')?.dataset.cellPixels) > 0,
    );
    assert.ok(Number(await page.locator('.cartesian-world').getAttribute('data-map-width')) >= 15);
    await page.screenshot({ path: `${out}/${channel}-square-map.png` });
    let mapRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/map?') || request.url().includes('/atlas/terrain'))
        mapRequests++;
    });
    const canvas = page.locator('.cartesian-world'),
      rect = await canvas.boundingBox(),
      before = await page.locator('.map-coordinate-hud strong').innerText();
    await page.mouse.move(rect.x + rect.width * 0.35, rect.y + rect.height * 0.65);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * 0.65, rect.y + rect.height * 0.45, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    assert.notEqual(await page.locator('.map-coordinate-hud strong').innerText(), before);
    assert.equal(mapRequests, 0);
    await page.getByRole('button', { name: 'Mi aldea 3D' }).click();
    await page.waitForFunction(() => window.__reinosPerf?.snapshot('city')?.frames > 60, null, {
      timeout: 60000,
    });
    assert.equal(await page.locator('.city-level').count(), 52);
    await page.screenshot({ path: `${out}/${channel}-empty-city.png` });
    assert.equal(await page.getByRole('button', { name: 'Ejército', exact: true }).count(), 0);
    assert.equal(
      await page.getByLabel('Ejército y ataques de la aldea', { exact: true }).isVisible(),
      true,
    );
    assert.equal(await page.getByLabel('Catálogo de construcción', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Mapa del mundo', exact: false }).click();
    await page.locator('.cartesian-world').waitFor();
    assert.equal(mapRequests, 0);
    await page.getByRole('button', { name: 'Mi aldea 3D' }).click();
    await page.locator('.city-level[data-plot="22"]').waitFor();
    await page.locator('.city-level[data-plot="22"]').click();
    await page.getByRole('dialog').waitFor();
    assert.equal(
      await page.getByRole('dialog').getByText('Bosque maderero', { exact: true }).count(),
      1,
    );
    assert.equal(await page.getByRole('dialog').getByText('Cuartel', { exact: true }).count(), 0);
    await page.screenshot({ path: `${out}/${channel}-plot-modal.png` });
    await page.getByRole('button', { name: 'Cerrar edificio', exact: true }).click();
    const building = await context.request.post(`${url}/buildings`, {
      headers: { 'x-csrf-token': me.csrfToken, 'idempotency-key': crypto.randomUUID() },
      data: { plot: 22, buildingType: 'sawmill' },
    });
    assert.equal(building.status(), 201);
    await page.locator('.city-level.constructing[data-plot="22"]').waitFor({ timeout: 15000 });
    assert.equal(
      await page.getByLabel('Construcciones en curso', { exact: true }).isVisible(),
      true,
    );
    assert.equal(
      await page
        .locator('.realm-resourcebar')
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
      0,
    );
    await page.screenshot({ path: `${out}/${channel}-construction-animation.png` });
    // Nueve aldeas adicionales únicamente en la base aislada de QA.
    const origin = (await db.query('select * from villages where id=$1', [villageId])).rows[0],
      layout = (await db.query('select * from village_layouts where village_id=$1', [villageId]))
        .rows[0];
    let extra = 0;
    const extraIds = [];
    for (let dy = -5; dy <= 5 && extra < 9; dy++)
      for (let dx = -5; dx <= 5 && extra < 9; dx++) {
        const x = origin.x + dx,
          y = origin.y + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= 1000 || y >= 1000) continue;
        const exists = (
          await db.query('select id from villages where world_id=$1 and x=$2 and y=$3', [
            world.id,
            x,
            y,
          ])
        ).rows;
        if (exists.length) continue;
        const id = crypto.randomUUID();
        extraIds.push(id);
        await db.query(
          "insert into villages(id,world_id,owner_account_id,kind,name,x,y,coastal) values($1,$2,$3,'PLAYER',$4,$5,$6,false)",
          [id, world.id, me.account.id, `Aldea ${++extra}`, x, y],
        );
        await db.query(
          'insert into village_layouts(world_id,village_id,version,seed,layout) values($1,$2,$3,$4,$5)',
          [world.id, id, layout.version, layout.seed, layout.layout],
        );
        await db.query(
          "insert into village_buildings(world_id,village_id,plot,type,level) values($1,$2,0,'city_hall',1)",
          [world.id, id],
        );
        await db.query(
          'insert into wall_sections(world_id,village_id,precinct,integrity) values($1,$2,1,1000),($1,$2,2,1000),($1,$2,3,1000)',
          [world.id, id],
        );
        await db.query(
          'insert into resource_accounts(world_id,village_id,wood_milli,stone_milli,iron_milli,food_milli,wood_rate_milli_h,stone_rate_milli_h,iron_rate_milli_h,food_rate_milli_h,capacity_milli,food_capacity_milli,last_settled_at) values($1,$2,500000,500000,500000,500000,40000,40000,40000,58000,800000,800000,now())',
          [world.id, id],
        );
      }
    const rivalContext = await browser.newContext();
    const rivalReg = await rivalContext.request.post(`${base}/api/v1/auth/register`, {
      data: {
        email: `rival${run}@example.test`,
        displayName: `Rival${run}`,
        password: 'qa-local-password-12345',
      },
    });
    assert.equal(rivalReg.status(), 201);
    const rival = await rivalReg.json();
    const rivalJoin = await rivalContext.request.post(`${base}/api/v1/worlds/${world.id}/join`, {
      headers: { 'x-csrf-token': rival.csrfToken, 'idempotency-key': crypto.randomUUID() },
      data: {
        civilization: 'forest_kin',
        villageName: `Rival ${run}`,
        characterName: `Rival${run}`,
        quadrant: 'NE',
      },
    });
    assert.equal(rivalJoin.status(), 201);
    const rivalVillage = (await rivalJoin.json()).villageId;
    for (const id of [villageId, rivalVillage, extraIds[0]]) {
      await db.query(
        "insert into village_buildings(world_id,village_id,plot,type,level) values($1,$2,2,'rally_point',1) on conflict(village_id,plot) do nothing",
        [world.id, id],
      );
      await db.query(
        "insert into troop_stacks(world_id,village_id,unit_type,quantity) values($1,$2,'militia',10) on conflict(village_id,unit_type) do update set quantity=10",
        [world.id, id],
      );
    }
    const march = async (request, csrf, from, to, mission) => {
      const res = await request.post(
        `${base}/api/v1/worlds/${world.id}/villages/${from}/movements`,
        {
          headers: { 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
          data: { targetVillageId: to, mission, units: [{ unitType: 'militia', quantity: 1 }] },
        },
      );
      assert.equal(res.status(), 201, await res.text());
      return res.json();
    };
    await db.query('update worlds set movement_speed_multiplier=1 where id=$1', [world.id]);
    await march(context.request, me.csrfToken, villageId, rivalVillage, 'RAID');
    await march(rivalContext.request, rival.csrfToken, rivalVillage, villageId, 'ATTACK');
    await march(context.request, me.csrfToken, extraIds[0], villageId, 'TRANSFER');
    await rivalContext.close();
    await page.getByLabel('Ataques entrantes: 1', { exact: true }).waitFor({ timeout: 20000 });
    await page.getByLabel('Refuerzos entrantes: 1', { exact: true }).waitFor();
    await page.getByLabel('Ataques entrantes: 1', { exact: true }).click();
    await page.getByLabel('Refuerzos entrantes: 1', { exact: true }).click();
    assert.equal(await page.locator('.force-group.under-attack').count(), 1);
    await page.screenshot({ path: `${out}/${channel}-permanent-army.png` });
    await page.getByRole('button', { name: 'Informes', exact: false }).click();
    assert.ok(await page.getByLabel('Ejército y ataques de la aldea', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Mi aldea 3D' }).click();
    await page.locator('.city-level[data-plot="0"]').click();
    await page.getByRole('dialog').getByLabel('Cultura y expansión', { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${channel}-culture.png` });
    await page.getByRole('button', { name: 'Cerrar edificio', exact: true }).click();
    // Mercado real por HTTP/UI con recursos y edificios preparados solo en reinos_test.
    const marketPlot = view.layout.plots.find(
      (p) => p.id !== 2 && p.kind==='industry'&&(!p.allowedTypes||p.allowedTypes.includes('market')),
    );
    const officePlot = view.layout.plots.find(
      (p) => p.id !== 2 && p.id !== marketPlot?.id &&p.kind==='industry'&&(!p.allowedTypes||p.allowedTypes.includes('trade_office')),
    );
    assert.ok(marketPlot && officePlot);
    for (const [plot, type] of [
      [marketPlot.id, 'market'],
      [officePlot.id, 'trade_office'],
    ])
      await db.query(
        'insert into village_buildings(world_id,village_id,plot,type,level) values($1,$2,$3,$4,4)',
        [world.id, villageId, plot, type],
      );
    await db.query(
      'update resource_accounts set wood_milli=5000000,stone_milli=5000000,iron_milli=5000000,food_milli=5000000,capacity_milli=10000000,food_capacity_milli=10000000 where village_id=$1',
      [villageId],
    );
    await db.query('update worlds set movement_speed_multiplier=1000 where id=$1', [world.id]);
    const destination = (
      await db.query('select x-500 as x,499-y as y from villages where id=$1', [extraIds[0]])
    ).rows[0];
    await page.waitForFunction(
      (plot) =>
        document.querySelector(`.city-level[data-plot="${plot}"]`)?.getAttribute('data-level') ===
        '4',
      marketPlot.id,
      { timeout: 20000 },
    );
    await page.locator(`.city-level[data-plot="${marketPlot.id}"]`).click();
    await page.getByLabel('Mercado y mercaderes', { exact: true }).waitFor();
    await page.getByLabel('Destino X', { exact: true }).fill(String(destination.x));
    await page.getByLabel('Destino Y', { exact: true }).fill(String(destination.y));
    await page.getByLabel('Carga: Madera', { exact: true }).fill('100');
    const denied = await context.request.post(`${url}/market/send`, {
      data: { ...destination, cargo: { wood: 100, stone: 0, iron: 0, food: 0 } },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    assert.equal(denied.status(), 403);
    await page.getByRole('button', { name: 'Enviar recursos', exact: true }).last().click();
    await page.locator('.trade-items').filter({ hasText: '100 madera' }).first().waitFor();
    await page.getByRole('button', { name: 'Ofertas', exact: true }).click();
    await page.getByLabel('Ofreces por lote: Madera', { exact: true }).fill('100');
    await page.getByLabel('Pides por lote: Barro', { exact: true }).fill('50');
    await page.getByRole('button', { name: 'Publicar oferta', exact: true }).click();
    await page.getByText('Tu oferta · 1 lotes', { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${channel}-market.png` });
    await page.getByRole('button', { name: 'Cancelar oferta', exact: true }).click();
    await page.getByText('Tu oferta · 1 lotes', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Rutas', exact: true }).click();
    await page.getByRole('button', { name: 'Programar ruta', exact: true }).click();
    await page.getByRole('button', { name: 'Desactivar ruta', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Desactivar ruta', exact: true }).click();
    await page.getByText('Ruta desactivada', { exact: true }).waitFor();
    await page.getByText('Historial de envíos', { exact: true }).click();
    await page.getByText(/100 madera · Entregado/).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Cerrar edificio', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('select[aria-label="Seleccionar aldea"] option').length === 10,
      null,
      { timeout: 20000 },
    );
    await page.getByRole('button', { name: 'Aldea siguiente', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('select[aria-label="Seleccionar aldea"]')?.selectedIndex === 1,
    );
    await page.getByRole('button', { name: 'Mapa del mundo', exact: false }).click();
    await page.locator('.cartesian-world').waitFor();
    await page.screenshot({ path: `${out}/${channel}-ten-villages.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${out}/${channel}-season-mobile.png` });
    assert.ok(await page.getByLabel('Seleccionar aldea', { exact: true }).isVisible());
    assert.deepEqual(errors, []);
    results.push({
      channel,
      login: true,
      roles: true,
      joinSteps: true,
      cartesianSquare: true,
      emptyCity: true,
      plotModal: true,
      tenVillages: true,
      naturalDragWithoutRequests: true,
      mapRestored: true,
      permanentArmy: true,
      friendlyIncomingSeparate: true,
      cultureDialog: true,
      constructionAnimation: true,
      marketSend: true,
      marketOffers: true,
      marketRoutes: true,
      marketHistory: true,
      marketCsrf: true,
      errors,
    });
    console.log(`${channel}: experiencia verificada`);
  } finally {
    await context.close();
    await browser.close();
  }
}
await db.end();
writeFileSync(`${out}/season-browser-results.json`, JSON.stringify(results, null, 2));
