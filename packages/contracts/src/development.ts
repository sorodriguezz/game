import { z } from 'zod';
import { UNIT_TYPES } from '@reinos/game-config';
export const researchRequestSchema = z.object({
  kind: z.enum(['UNLOCK', 'WEAPON', 'ARMOR']),
  unitType: z.enum(UNIT_TYPES),
});
export const demolitionRequestSchema = z.object({
  kind: z.literal('DEMOLISH'),
  plot: z.number().int().min(0).max(63),
  confirmed: z.literal(true),
});
export const developmentRequestSchema = z.union([researchRequestSchema, demolitionRequestSchema]);
export type DevelopmentRequest = z.infer<typeof developmentRequestSchema>;
export interface ResearchView {
  unitType: (typeof UNIT_TYPES)[number];
  kind: 'UNLOCK' | 'WEAPON' | 'ARMOR';
  level: number;
}
export interface DevelopmentOrderView {
  id: string;
  kind: 'UNLOCK' | 'WEAPON' | 'ARMOR' | 'DEMOLISH';
  target: string;
  targetLevel: number;
  plot: number | null;
  startedAt: string;
  completesAt: string;
}
