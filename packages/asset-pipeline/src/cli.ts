import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assetManifestSchema } from './manifest.js';
import { inspectGlbFile } from './inspect.js';

/**
 * Valida el catálogo de assets: contrato + inspección de cada GLB declarado.
 * Uso: tsx src/cli.ts <manifest.json> <raíz-pública>
 * Sale con código 1 si un asset APPROVED no cumple, para bloquear CI (ADR-0018).
 */
const [manifestPath, publicRoot] = process.argv.slice(2);
if (!manifestPath || !publicRoot) {
  console.error('uso: cli.ts <manifest.json> <raíz-pública>');
  process.exit(2);
}

const parsed = assetManifestSchema.safeParse(JSON.parse(await readFile(manifestPath, 'utf8')));
if (!parsed.success) {
  console.error('Manifest inválido:');
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}

let failures = 0;
const counts: Record<string, number> = {};
for (const a of parsed.data.assets) {
  counts[a.status] = (counts[a.status] ?? 0) + 1;
  if (!a.file) continue;
  try {
    const report = await inspectGlbFile(resolve(publicRoot, a.file), a);
    const tag = report.problems.length === 0 ? 'OK ' : a.status === 'APPROVED' ? 'ERR' : 'WARN';
    console.log(
      `[${tag}] ${a.assetId}: ${report.triangles} tris, ${report.materials} mats, ${report.maxTextureSize}px, ${report.bytes} B`,
    );
    for (const p of report.problems) console.log(`      - ${p}`);
    if (a.status === 'APPROVED' && report.problems.length > 0) failures++;
  } catch (e) {
    console.log(
      `[ERR] ${a.assetId}: no se pudo leer ${a.file} (${e instanceof Error ? e.message : String(e)})`,
    );
    if (a.status === 'APPROVED') failures++;
  }
}
console.log(`Resumen por estado: ${JSON.stringify(counts)}`);
if ((counts.BLOCKOUT ?? 0) > 0) {
  console.log(
    'Aviso: hay assets en BLOCKOUT; el cliente usa el kit procedural (no apto como arte final).',
  );
}
process.exit(failures > 0 ? 1 : 0);
