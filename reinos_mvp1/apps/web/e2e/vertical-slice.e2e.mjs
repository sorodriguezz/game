// Escenario integral Gate 1 en navegador real (PRD §18, ADR-0018).
// Requiere la pila levantada (API, worker, Vite) y el mundo 'prueba-rapida' recién sembrado.
// Uso: E2E_BASE=http://127.0.0.1:5173 node e2e/vertical-slice.e2e.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.E2E_OUT ?? new URL('./screenshots', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const S = OUT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPlayer(browser, name, civ) {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[${name} console]`, m.text());
  });
  page.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message));
  await page.goto(BASE);
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Correo').fill(`${name.toLowerCase()}@example.test`);
  await page.getByLabel('Nombre de gobernante').fill(name);
  await page.getByLabel(/Contraseña/).fill('una-contraseña-larga');
  if (name === 'Aurelia') await page.screenshot({ path: `${S}/01-auth.png` });
  await page.getByRole('button', { name: 'Crear cuenta' }).last().click();
  await page.getByRole('heading', { name: 'Mundos' }).waitFor();
  const card = page.locator('article.world', { hasText: 'Prueba Rápida' });
  await card.getByRole('button', { name: 'Unirse' }).click();
  await card.locator(`input[value="${civ}"]`).check();
  await card
    .getByLabel('Nombre de tu ciudad')
    .fill(name === 'Aurelia' ? 'Valdecorona' : 'Puertoazul');
  if (name === 'Aurelia') await page.screenshot({ path: `${S}/02-worlds.png` });
  await card.getByRole('button', { name: 'Fundar ciudad' }).click();
  await page.locator('canvas').first().waitFor();
  return { ctx, page };
}

await (async () => {
  const browser = await chromium.launch({
    args: [
      ...(process.env.E2E_SWIFTSHADER === '0'
        ? []
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
    ],
  });
  const a = await newPlayer(browser, 'Aurelia', 'imperial_crown');
  await sleep(6000);
  await a.page.screenshot({ path: `${S}/03-city.png` });
  const fps = await a.page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(f);
          else res(n / 3);
        };
        requestAnimationFrame(f);
      }),
  );
  console.log('FPS (swiftshader, sin GPU):', fps.toFixed(1));

  // Construir cuartel en parcela libre 3
  await a.page.getByRole('button', { name: 'Parcela 3' }).click();
  const barracks = a.page
    .locator('.option')
    .filter({ has: a.page.locator('strong', { hasText: /^Cuartel$/ }) });
  await barracks.getByRole('button', { name: 'Construir' }).click();
  await a.page.getByText(/Obra iniciada/).waitFor();
  await sleep(2500);
  await a.page.screenshot({ path: `${S}/04-building.png` });

  const d = await newPlayer(browser, 'Brisa', 'sea_league');
  await sleep(4000);
  await d.page.screenshot({ path: `${S}/05-city-league.png` });
  const dCoords = await d.page.evaluate(async () => {
    const worlds = await (await fetch('/api/v1/worlds')).json();
    const w = worlds.find((x) => x.slug === 'prueba-rapida');
    const v = await (
      await fetch(`/api/v1/worlds/${w.id}/villages/${w.membership.villageIds[0]}`)
    ).json();
    return { x: v.x, y: v.y };
  });
  await d.ctx.close(); // el defensor se desconecta

  // Esperar fin de obra (600 s / 50 = 12 s) y reclutar milicia
  await sleep(14000);
  await a.page.reload();
  await a.page.locator('canvas').first().waitFor();
  await a.page.getByRole('tab', { name: 'Ejército' }).click();
  await a.page.getByLabel('Cantidad de Milicia').fill('12');
  await a.page
    .locator('.option', { hasText: 'Milicia' })
    .getByRole('button', { name: 'Reclutar' })
    .click();
  await a.page.getByText(/Reclutando/).waitFor();
  await a.page.screenshot({ path: `${S}/06-army.png` });
  await sleep(12 * 2400 + 3000); // 120 s/50 = 2,4 s por unidad
  await a.page.getByRole('tab', { name: 'Ciudad' }).click();
  await a.page.getByRole('tab', { name: 'Campaña' }).click();
  await a.page.locator('canvas.map').waitFor();
  await sleep(1500);
  // Buscar a Brisa por coordenadas y seleccionarla en el mapa
  await a.page.getByLabel('Coordenada X').fill(String(dCoords.x));
  await a.page.getByLabel('Coordenada Y').fill(String(dCoords.y));
  await a.page.getByRole('button', { name: 'Ir a coordenadas' }).click();
  await a.page.getByText(`centro (${dCoords.x}|${dCoords.y})`).waitFor();
  await sleep(1500);
  const target = await a.page.evaluate(async (c) => {
    const worlds = await (await fetch('/api/v1/worlds')).json();
    const w = worlds.find((x) => x.slug === 'prueba-rapida');
    const map = await (
      await fetch(`/api/v1/worlds/${w.id}/map?x=${c.x}&y=${c.y}&radius=16`)
    ).json();
    const t = map.villages.find((x) => x.x === c.x && x.y === c.y);
    return {
      fx: (t.x - map.originX + 0.5) / map.width,
      fy: (t.y - map.originY + 0.5) / map.height,
    };
  }, dCoords);
  const box = await a.page.locator('canvas.map').boundingBox();
  await a.page.mouse.click(box.x + target.fx * box.width, box.y + target.fy * box.height);
  await a.page.getByText(/Objetivo:/).waitFor();
  await a.page.getByRole('button', { name: 'todas' }).first().click();
  await a.page.screenshot({ path: `${S}/07-campaign.png` });
  await a.page.getByRole('button', { name: 'Enviar saqueo' }).click();
  await a.page.getByText(/Tropas en marcha/).waitFor();
  const eta = await a.page.evaluate(async () => {
    const worlds = await (await fetch('/api/v1/worlds')).json();
    const w = worlds.find((x) => x.slug === 'prueba-rapida');
    const v = await (
      await fetch(`/api/v1/worlds/${w.id}/villages/${w.membership.villageIds[0]}`)
    ).json();
    return new Date(v.movements[0].arrivesAt).getTime() - new Date(v.serverTime).getTime();
  });
  console.log('Llegada en ms:', eta);
  await sleep(eta + 4000);
  await a.page.getByRole('tab', { name: 'Informes' }).click();
  await a.page.locator('.reports li').first().waitFor({ timeout: 20000 });
  await a.page.locator('.reports li button').first().click();
  await a.page.getByText('Desarrollo del combate').waitFor();
  await a.page.screenshot({ path: `${S}/08-report.png` });
  console.log('E2E OK');
  await browser.close();
})().catch((e) => {
  console.error('E2E FAILED', e);
  process.exit(1);
});
