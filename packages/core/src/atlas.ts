import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { terrainAt } from '@reinos/game-rules';
import { rulesetOf, type WorldRow } from './village-state.js';
const compress = promisify(gzip),
  cache = new Map<string, Promise<{ data: Buffer; etag: string }>>();
/** Un byte por casilla. Se transfiere comprimido una vez y se recorre localmente. */
export async function atlasTerrain(world: WorldRow) {
  const key = `${world.rulesetVersion}:${world.mapSeed}:${world.mapSize}:${rulesetOf(world).territory ? 'LAND' : 'ARCHIPELAGO'}`;
  let pending = cache.get(key);
  if (pending) return pending;
  pending = (async () => {
    const data = new Uint8Array(world.mapSize * world.mapSize),
      codes = { PLAIN: 0, FOREST: 1, MOUNTAIN: 2, OASIS: 3, SEA: 4 },
      mode = rulesetOf(world).territory ? 'LAND' : 'ARCHIPELAGO';
    for (let y = 0; y < world.mapSize; y++) {
      for (let x = 0; x < world.mapSize; x++)
        data[y * world.mapSize + x] = codes[terrainAt(world.mapSeed, world.mapSize, x, y, mode)];
      if (y % 32 === 31) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return {
      data: await compress(data, { level: 6 }),
      etag: `"${createHash('sha256').update(data).digest('hex')}"`,
    };
  })();
  cache.set(key, pending);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  try {
    return await pending;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}
