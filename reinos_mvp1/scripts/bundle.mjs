// Empaqueta una app Node (API/worker) en un único ESM: incluye los paquetes
// @reinos/* (fuente TS) y deja externas las dependencias de node_modules.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [entry, outfile] = process.argv.slice(2);
if (!entry || !outfile) throw new Error('uso: bundle.mjs <entrada> <salida>');
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@reinos/'));

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'bundle',
  external: [...external, 'drizzle-orm/*', '@nestjs/*', 'class-validator', 'class-transformer'],
  tsconfig: 'tsconfig.json',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
console.log(`bundle → ${outfile}`);
