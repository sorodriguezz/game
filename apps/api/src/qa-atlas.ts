import { createDatabase, requireDatabaseUrl, worlds } from '@reinos/db';
import { atlasTerrain } from '@reinos/core';
import { terrainAt } from '../../../packages/game-rules/src/map.js';
import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const database = createDatabase(requireDatabaseUrl(), { max: 1 });
try {
  const [template] = await database.db.select().from(worlds).limit(1);
  if (!template) throw new Error('Falta mundo de referencia');
  const results = [];
  for (const size of [1000, 2000, 5000]) {
    const before = performance.now(),
      memory = process.memoryUsage().rss;
    let maxLoopDelay = 0,
      last = performance.now();
    const probe = setInterval(() => {
      const now = performance.now();
      maxLoopDelay = Math.max(maxLoopDelay, now - last - 10);
      last = now;
    }, 10);
    const world = { ...template, mapSize: size, mapSeed: template.mapSeed + size },
      file = await atlasTerrain(world);
    clearInterval(probe);
    const ms = performance.now() - before,
      decoded = gunzipSync(file.data);
    if (decoded.length !== size * size) throw new Error('Atlas incompleto');
    const codes = { PLAIN: 0, FOREST: 1, MOUNTAIN: 2, OASIS: 3, SEA: 4 };
    for (let n = 0; n < 100; n++) {
      const x = (n * 97) % size,
        y = (n * 173) % size;
      if (decoded[y * size + x] !== codes[terrainAt(world.mapSeed, size, x, y, 'LAND')])
        throw new Error('Casilla incorrecta');
    }
    results.push({
      size,
      cells: size * size,
      bytes: decoded.length,
      compressedBytes: file.data.length,
      generationMs: Math.round(ms),
      maxLoopDelayMs: Math.round(maxLoopDelay),
      rssDeltaMiB: Math.round((process.memoryUsage().rss - memory) / 1048576),
    });
  }
  writeFileSync(
    fileURLToPath(
      new URL('../../../docs/requirements/evidence/atlas-benchmark.json', import.meta.url),
    ),
    JSON.stringify(results, null, 2),
  );
  console.log(results);
} finally {
  await database.close();
}
