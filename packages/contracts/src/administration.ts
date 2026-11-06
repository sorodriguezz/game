import { z } from 'zod';
import { registerRequestSchema, ACCOUNT_ROLES, WORLD_STATUSES, type AccountRole } from './dto.js';
export const createManagedUserSchema = registerRequestSchema.extend({
  role: z.enum(ACCOUNT_ROLES),
});
export const updateManagedUserSchema = z.object({
  displayName: z.string().trim().min(3).max(24).optional(),
  role: z.enum(ACCOUNT_ROLES).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});
export const createManagedWorldSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    description: z.string().trim().max(1500).default(''),
    rulesetVersion: z.enum(['frontier-alpha.3', 'frontier-alpha.4']).default('frontier-alpha.4'),
    mapSize: z.union([z.literal(1000), z.literal(2000), z.literal(5000)]),
    speedMultiplier: z.number().int().min(1).max(5),
    movementSpeedMultiplier: z.number().int().min(1).max(5).default(1),
    mapSeed: z.number().int().min(1).max(2147483647),
    protectionHours: z.number().int().min(0).max(720).default(72),
    opensAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable().default(null),
  })
  .refine(
    (w) => !w.endsAt || Date.parse(w.endsAt) > Date.parse(w.opensAt),
    'El cierre debe ser posterior al inicio',
  );
export const worldActionSchema = z.object({
  action: z.enum(['PUBLISH', 'PAUSE', 'RESUME', 'FINISH', 'ARCHIVE', 'CANCEL']),
});
export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(100),
  body: z.string().trim().min(3).max(4000),
});
export const complaintSchema = z.object({
  category: z.enum(['CHEATING', 'ABUSE', 'CONTENT', 'OTHER']),
  description: z.string().trim().min(10).max(4000),
  targetAccountId: z.uuid().nullable().default(null),
});
export const resolveComplaintSchema = z.object({
  status: z.enum(['REVIEWING', 'RESOLVED', 'ESCALATED']),
  note: z.string().trim().min(3).max(2000),
});
export const sanctionSchema = z.object({
  accountId: z.uuid(),
  kind: z.enum(['WARNING', 'SUSPENSION']),
  reason: z.string().trim().min(5).max(2000),
  hours: z.number().int().min(1).max(168).default(24),
});
export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: AccountRole;
  status: string;
  worlds: string[];
}
export interface ManagedWorld {
  rulesetVersion: string;
  mapSeed: number;
  protectionHours: number;
  id: string;
  name: string;
  description: string;
  status: (typeof WORLD_STATUSES)[number];
  mapSize: number;
  speedMultiplier: number;
  movementSpeedMultiplier: number;
  opensAt: string;
  endsAt: string | null;
  players: number;
  villages: number;
  moderators: Array<{ id: string; displayName: string }>;
}
export interface StaffOverview {
  role: AccountRole;
  worlds: ManagedWorld[];
  users: ManagedUser[];
  stats: {
    accounts: number;
    worlds: number;
    players: number;
    villages: number;
    battles: number;
    movements: number;
    complaints: number;
  };
  audit: Array<{
    id: string;
    actorName: string;
    action: string;
    worldId: string | null;
    createdAt: string;
    details: unknown;
  }>;
}
export interface ModerationWorld {
  id: string;
  name: string;
  players: Array<{ accountId: string; name: string; civilization: string; villages: number }>;
  alliances: Array<{ id: string; name: string; members: number }>;
  complaints: Array<{
    id: string;
    category: string;
    description: string;
    status: string;
    createdAt: string;
  }>;
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
  sanctions: Array<{
    id: string;
    accountId: string;
    kind: string;
    reason: string;
    expiresAt: string;
  }>;
}
