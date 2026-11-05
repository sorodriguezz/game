// Escenario TRAINING del MVP 2 en navegador real (M2-G1-01/02, PLAN_QA_MVP2 §E2E).
// Requiere la pila levantada: API, worker, battle-server (:2567) y Vite con el proxy /battle.
// Uso: E2E_BASE=http://127.0.0.1:5173 node e2e/tactical-training.e2e.mjs
// 1) batalla completa contra la doctrina hasta el resultado; 2) duelo PvP entre dos navegadores.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.E2E_OUT ?? new URL('./screenshots', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const RUN = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function newUser(browser, name) {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`[${name} pageerror]`, e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('401'))
      log(`[${name} console]`, m.text().slice(0, 200));
  });
  await page.goto(BASE);
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Correo').fill(`${name.toLowerCase()}.${RUN}@example.test`);
  await page.getByLabel('Nombre de gobernante').fill(`${name}${RUN}`);
  await page.getByLabel(/Contraseña/).fill('una-contraseña-larga');
  await page.getByRole('button', { name: 'Crear cuenta' }).last().click();
  await page.getByRole('heading', { name: 'Mundos' }).waitFor();
  await page.getByRole('button', { name: /Entrenamiento táctico/ }).click();
  await page.getByText('Campo de entrenamiento táctico').waitFor();
  return { ctx, page };
}

const badge = async (page) => (await page.locator('.scene-badge').textContent()) ?? '';

async function selectAll(page) {
  const items = page.locator('.formations li button');
  const n = await items.count();
  for (let i = 0; i < n; i++) await items.nth(i).click({ modifiers: i ? ['Shift'] : [] });
  return n;
}

async function holdKey(page, key, ms) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}

await (async () => {
  const browser = await chromium.launch({
    args:
      process.env.E2E_SWIFTSHADER === '0'
        ? []
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  // --- 1. Contra la doctrina: 24 formaciones, hasta el resultado ---
  const a = await newUser(browser, 'Comandante');
  await a.page.screenshot({ path: `${OUT}/t01-lobby.png` });
  const card = a.page.locator('article', { hasText: 'Contra la doctrina' });
  await card.getByLabel('Tu ejército').selectOption('large');
  await card.getByLabel('Ejército rival').selectOption('large');
  await card.getByRole('button', { name: 'Empezar batalla' }).click();
  await a.page.locator('.arena-scene canvas').waitFor({ timeout: 60000 });
  await sleep(7000);
  const deploy = await badge(a.page);
  log('despliegue:', deploy);
  if (!/[1-9]\d* soldados/.test(deploy)) throw new Error(`sin soldados visibles: ${deploy}`);
  await a.page.screenshot({ path: `${OUT}/t02-deploy.png` });

  // Avance general hacia el enemigo; la cámara acompaña y se da la orden de nuevo cerca del frente.
  await selectAll(a.page);
  const box = await a.page.locator('.arena-scene').boundingBox();
  await a.page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2, { button: 'right' });
  await a.page.keyboard.press('2'); // cuña
  await sleep(14000);
  await holdKey(a.page, 'w', 1600);
  await sleep(1000);
  await selectAll(a.page);
  await a.page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.15, { button: 'right' });
  await sleep(16000);
  log('combate:', await badge(a.page));
  await a.page.screenshot({ path: `${OUT}/t03-combat.png` });

  await a.page.locator('.result-overlay').waitFor({ timeout: 420000 });
  await sleep(1500);
  const title = await a.page.locator('.result-overlay h2').textContent();
  log('resultado:', title, '|', await a.page.locator('.result-overlay p').first().textContent());
  await a.page.screenshot({ path: `${OUT}/t04-result.png` });
  await a.ctx.close();

  // --- 2. Duelo PvP entre dos navegadores (contextos y cuentas distintos) ---
  const h = await newUser(browser, 'Anfitrion');
  await h.page
    .locator('article', { hasText: 'Duelo con otro jugador' })
    .getByRole('button', { name: 'Crear invitación' })
    .click();
  const code = (await h.page.locator('.invite-code').textContent()).trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`código inválido: ${code}`);
  log('código:', code);
  const g = await newUser(browser, 'Invitado');
  const duel = g.page.locator('article', { hasText: 'Duelo con otro jugador' });
  await duel.getByLabel('Tu civilización').selectOption('sea_league');
  await duel.getByLabel('Código de invitación').fill(code);
  await duel.getByRole('button', { name: 'Unirse al duelo' }).click();
  await g.page.locator('.arena-scene canvas').waitFor({ timeout: 90000 });
  await h.page.locator('.arena-scene canvas').waitFor({ timeout: 90000 });
  await sleep(8000);
  const hostBar = (await h.page.locator('.topbar').textContent()) ?? '';
  log('pvp anfitrión:', hostBar);
  if (!hostBar.includes(`Invitado${RUN}`))
    throw new Error('el anfitrión no ve al invitado como rival');
  await h.page.screenshot({ path: `${OUT}/t05-pvp-host.png` });
  await g.page.screenshot({ path: `${OUT}/t06-pvp-guest.png` });
  await h.ctx.close();
  await g.ctx.close();
  await browser.close();
  log('TACTICAL E2E OK');
})().catch((e) => {
  console.error('TACTICAL E2E FAILED', e);
  process.exit(1);
});
