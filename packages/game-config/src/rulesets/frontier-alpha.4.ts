import { rulesetFrontierAlpha3 } from './frontier-alpha.3.js';
import { rulesetSchema } from '../types.js';
export const rulesetFrontierAlpha4 = rulesetSchema.parse({
  ...structuredClone(rulesetFrontierAlpha3),
  version: 'frontier-alpha.4',
  status: 'PROPOSAL',
  trade: {
    version: 'trade-1',
    officeCapacityPermillePerLevel: 100,
    minRouteSeconds: 3600,
    merchants: {
      romans: { capacity: 500, speed: 16 },
      gauls: { capacity: 750, speed: 24 },
      teutons: { capacity: 1000, speed: 12 },
    },
  },
  culture: {
    version: 'culture-1',
    thresholdBase: 500,
    castleLevels: [10, 15, 20],
    celebrationPoints: 500,
    celebrationSeconds: 86400,
    celebrationCost: { wood: 3000, stone: 3000, iron: 2000, food: 2000 },
  },
});
