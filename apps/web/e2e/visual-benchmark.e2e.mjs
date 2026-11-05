// Benchmark visual reproducible (rediseño visual, Fase 0/8): capturas por pantalla y
// resolución + telemetría instrumentada de render (window.__reinosPerf).
// Requiere la pila levantada y, para la ciudad desarrollada, `psql` contra la BD de DESARROLLO.
// Uso (contra el build de producción servido con `vite preview`):
//   BENCH_LABEL=baseline E2E_BASE=http://127.0.0.1:4173 node e2e/visual-benchmark.e2e.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4173';
const LABEL = process.env.BENCH_LABEL ?? 'run';
const OUT =
  process.env.E2E_OUT ?? new URL(`./screenshots/bench-${LABEL}`, import.meta.url).pathname;
const DB =
  process.env.BENCH_DB_URL ??
  'postgresql://reinos_dev:reinos_dev_change_me@127.0.0.1:5432/reinos_dev';
const WARMUP_MS = Number(process.env.BENCH_WARMUP_MS ?? 6000);
const MEASURE_MS = Number(process.env.BENCH_MEASURE_MS ?? 8000);
mkdirSync(OUT, { recursive: true });
const RUN = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const results = {
  label: LABEL,
  base: BASE,
  at: new Date().toISOString(),
  environment: {},
  scenarios: {},
};

// La ciudad de vitrina se fija escribiendo en la BD: solo se permite contra una BD local.
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(DB)) throw new Error('BENCH_DB_URL debe ser local');
const psql = (sql) => execFileSync('psql', [DB, '-tAqc', sql]).toString().trim();

async function measure(page, scene, name) {
  await page.waitForFunction((s) => window.__reinosPerf?.scenes().includes(s), scene, {
    timeout: 60000,
  });
  await sleep(WARMUP_MS);
  await page.evaluate((s) => window.__reinosPerf.reset(s), scene);
  await sleep(MEASURE_MS);
  const snap = await page.evaluate((s) => window.__reinosPerf.snapshot(s), scene);
  results.scenarios[name] = snap;
  log(
    `${name}: ${snap.fps} FPS · frame p50 ${snap.frameMs.p50} / p95 ${snap.frameMs.p95} ms · CPU ${snap.cpuMs.avg} ms · ` +
      `${snap.drawCalls.avg} draw calls · ${snap.sceneTriangles} tris · ${snap.meshInstances} mesh inst. · VRAM ${snap.vramMB?.total ?? '—'} MB`,
  );
  return snap;
}

async function loadMetrics(page, name) {
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const bytes = res.reduce((s, r) => s + (r.transferSize || 0), nav?.transferSize ?? 0);
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    return {
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      loadMs: Math.round(nav?.loadEventEnd ?? 0),
      transferKB: Math.round(bytes / 1024),
      resources: res.length,
      jsHeapMB: mem,
    };
  });
  results.scenarios[name] = { ...(results.scenarios[name] ?? {}), load: m };
  log(`${name} carga:`, JSON.stringify(m));
}

async function shot(page, file) {
  await page.screenshot({ path: `${OUT}/${file}.png` });
}

async function register(page, name) {
  return page.evaluate(
    async ({ name, run }) => {
      const r = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: `${name.toLowerCase()}.${run}@example.test`,
          displayName: `${name}${run}`,
          password: 'una-contraseña-larga',
        }),
      });
      if (!r.ok) throw new Error(`registro ${r.status}`);
      return r.json();
    },
    { name, run: RUN },
  );
}

async function join(page, csrf, slug, civilization, villageName) {
  return page.evaluate(
    async ({ csrf, slug, civilization, villageName }) => {
      const worlds = await (await fetch('/api/v1/worlds')).json();
      const w = worlds.find((x) => x.slug === slug);
      const j = await fetch(`/api/v1/worlds/${w.id}/join`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ civilization, villageName }),
      });
      if (!j.ok) throw new Error(`join ${j.status}`);
      return { worldId: w.id, ...(await j.json()) };
    },
    { csrf, slug, civilization, villageName },
  );
}

await (async () => {
  const browser = await chromium.launch({
    args:
      process.env.E2E_SWIFTSHADER === '0'
        ? []
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('401')) log('[console]', m.text().slice(0, 200));
  });

  // --- Autenticación y mundos ---
  await page.goto(BASE);
  await page.getByRole('tab', { name: 'Crear cuenta' }).waitFor();
  await loadMetrics(page, 'auth');
  results.environment = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'desconocido',
      cores: navigator.hardwareConcurrency,
    };
  });
  log('GPU:', results.environment.renderer);
  await shot(page, '01-auth-1920');
  await page.setViewportSize({ width: 1366, height: 768 });
  await shot(page, '01-auth-1366');
  await page.setViewportSize({ width: 1920, height: 1080 });
  const me = await register(page, 'Bench');
  await page.reload();
  await page.getByRole('heading', { name: 'Mundos' }).waitFor();
  await shot(page, '02-worlds-1920');
  await page.setViewportSize({ width: 1366, height: 768 });
  await shot(page, '02-worlds-1366');
  await page.setViewportSize({ width: 1920, height: 1080 });

  // --- Ciudad pequeña (recién fundada) ---
  const small = await join(page, me.csrfToken, 'prueba-rapida', 'imperial_crown', 'Villabench');
  await page.goto(`${BASE}/#/w/${small.worldId}/v/${small.villageId}`);
  await page.locator('.scene canvas').first().waitFor();
  await measure(page, 'city', 'city-small');
  await loadMetrics(page, 'city-small');
  await shot(page, '03-city-small-1920');

  // --- Ciudad desarrollada con muralla (y puerto si la aldea es costera): fijada en BD local ---
  const dev = await join(page, me.csrfToken, 'frontera-1', 'imperial_crown', 'Altabench');
  const coastal = psql(`select coastal from villages where id='${dev.villageId}'`) === 't';
  const layout = [
    [0, 'city_hall', 9],
    [1, 'imperial_bastion', 3],
    [2, 'warehouse', 5],
    [3, 'barracks', 8],
    [4, 'hospital', 4],
    [5, 'temple', 8],
    [6, 'sawmill', 6],
    [7, 'quarry', 5],
    [8, 'farm', 9],
    [10, 'mine', 4],
    [13, 'wall', 9],
    ...(coastal ? [[12, 'port', 6]] : []),
  ];
  psql(`delete from village_buildings where village_id='${dev.villageId}'`);
  for (const [plot, type, level] of layout)
    psql(
      `insert into village_buildings(world_id,village_id,plot,type,level) values ('${dev.worldId}','${dev.villageId}',${plot},'${type}',${level})`,
    );
  results.environment.developedCityCoastal = coastal;
  await page.goto(`${BASE}/#/w/${dev.worldId}/v/${dev.villageId}`);
  await page.reload();
  await page.locator('.scene canvas').first().waitFor();
  await measure(page, 'city', 'city-developed');
  await shot(page, '04-city-developed-1920');
  const box = await page.locator('.scene canvas').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -400);
    await sleep(120);
  }
  await sleep(2500);
  await shot(page, '05-city-developed-close-1920');
  await page.getByRole('button', { name: 'Templo', exact: true }).dispatchEvent('click');
  await sleep(1500);
  await shot(page, '06-city-selected-panel-1920');

  // --- Interfaz con paneles abiertos ---
  await page.getByRole('tab', { name: 'Ejército' }).dispatchEvent('click');
  await sleep(800);
  await shot(page, '07-army-1920');
  await page.getByRole('tab', { name: 'Informes' }).dispatchEvent('click');
  await measure(page, 'city', 'city-panels-open');
  await page.getByRole('tab', { name: 'Campaña' }).dispatchEvent('click');
  await page.locator('canvas.map').waitFor();
  await sleep(1500);
  await shot(page, '08-map-1920');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('tab', { name: 'Ciudad' }).dispatchEvent('click');
  await sleep(3000);
  await shot(page, '09-city-1366');
  await page.setViewportSize({ width: 2560, height: 1440 });
  await sleep(3000);
  await shot(page, '10-city-2560');
  await page.setViewportSize({ width: 1920, height: 1080 });

  // --- Batallas tácticas de entrenamiento ---
  for (const [name, army] of [
    ['arena-balanced', 'balanced'],
    ['arena-large', 'large'],
  ]) {
    await page.goto(`${BASE}/#/training`);
    await page.getByText('Campo de entrenamiento táctico').waitFor();
    if (name === 'arena-balanced') await shot(page, '11-training-lobby-1920');
    const card = page.locator('article', { hasText: 'Contra la doctrina' });
    await card.getByLabel('Tu ejército').selectOption(army);
    await card.getByLabel('Ejército rival').selectOption(army);
    await card.getByRole('button', { name: 'Empezar batalla' }).click();
    await page.locator('.arena-scene canvas').waitFor({ timeout: 60000 });
    const snap = await measure(page, 'arena', name);
    snap.visibleSoldiers = Number(
      ((await page.locator('.scene-badge').textContent()) ?? '').match(/(\d+) soldados/)?.[1] ?? 0,
    );
    await shot(page, `12-${name}-1920`);
    await page.getByRole('button', { name: /Salir del campo/ }).dispatchEvent('click');
  }

  writeFileSync(`${OUT}/perf-${LABEL}.json`, JSON.stringify(results, null, 2));
  log(`resultados → ${OUT}/perf-${LABEL}.json`);
  await browser.close();
  log('BENCHMARK OK');
})().catch((e) => {
  console.error('BENCHMARK FAILED', e);
  process.exit(1);
});
