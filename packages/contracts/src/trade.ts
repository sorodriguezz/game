import { z } from 'zod';
import { resourceBundleSchema, type ResourceBundle } from '@reinos/game-config';
const cargo = resourceBundleSchema
  .refine((c) => Object.values(c).some((n) => n > 0), 'La carga está vacía')
  .refine((c) => Object.values(c).every((n) => n <= 100000000), 'Carga excesiva');
export const tradeSendSchema = z.object({
  x: z.number().int().min(-5000).max(4999),
  y: z.number().int().min(-5000).max(4999),
  cargo,
});
export const tradeOfferSchema = z.object({
  give: cargo,
  want: cargo,
  lots: z.number().int().min(1).max(100),
});
export const tradeAcceptSchema = z.object({
  offerId: z.uuid(),
  lots: z.number().int().min(1).max(100),
});
export const tradeRouteSchema = tradeSendSchema.extend({
  everySeconds: z.number().int().min(3600).max(604800),
});
export type TradeSendRequest = z.infer<typeof tradeSendSchema>;
export type TradeOfferRequest = z.infer<typeof tradeOfferSchema>;
export type TradeAcceptRequest = z.infer<typeof tradeAcceptSchema>;
export type TradeRouteRequest = z.infer<typeof tradeRouteSchema>;
export interface TradeTripView {
  id: string;
  direction: 'INCOMING' | 'OUTGOING';
  originName: string;
  targetName: string;
  status: 'OUTBOUND' | 'RETURNING' | 'COMPLETED';
  delivery: 'PENDING' | 'DELIVERED' | 'RETURNED';
  cargo: ResourceBundle;
  merchants: number;
  arrivesAt: string;
  returnsAt: string;
}
export interface TradeOfferView {
  id: string;
  villageId: string;
  ownerName: string;
  isMine: boolean;
  give: ResourceBundle;
  want: ResourceBundle;
  lots: number;
}
export interface TradeMarketView {
  merchants: { total: number; available: number; capacity: number; speed: number };
  offers: TradeOfferView[];
  trips: TradeTripView[];
  history: TradeTripView[];
  routes: Array<{
    id: string;
    cargo: ResourceBundle;
    targetName: string;
    everySeconds: number;
    nextAt: string;
    enabled: boolean;
    lastResult: string | null;
  }>;
}
