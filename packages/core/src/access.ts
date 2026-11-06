import { and, eq, gt } from 'drizzle-orm';
import { accounts, worldModerators, worldSanctions, type DbOrTx } from '@reinos/db';
import { err } from './context.js';
export async function requireAdmin(db: DbOrTx, accountId: string) {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a || a.status !== 'ACTIVE' || a.role !== 'ADMIN')
    throw err.forbidden('FORBIDDEN', 'Se requiere perfil Administrador');
  return a;
}
export async function requireStaff(db: DbOrTx, accountId: string, worldId?: string) {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a || a.status !== 'ACTIVE' || a.role === 'PLAYER')
    throw err.forbidden('FORBIDDEN', 'Se requiere perfil de gestión');
  if (a.role === 'MODERATOR' && worldId) {
    const [assignment] = await db
      .select()
      .from(worldModerators)
      .where(and(eq(worldModerators.worldId, worldId), eq(worldModerators.accountId, accountId)));
    if (!assignment) throw err.forbidden('FORBIDDEN', 'Mundo no asignado');
  }
  return a;
}
export async function requirePlayer(
  db: DbOrTx,
  accountId: string,
  worldId?: string,
  now = new Date(),
) {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a || a.role !== 'PLAYER' || a.status !== 'ACTIVE')
    throw err.forbidden('FORBIDDEN', 'Este acceso es exclusivo del perfil Jugador');
  if (worldId) {
    const [s] = await db
      .select()
      .from(worldSanctions)
      .where(
        and(
          eq(worldSanctions.worldId, worldId),
          eq(worldSanctions.accountId, accountId),
          eq(worldSanctions.kind, 'SUSPENSION'),
          gt(worldSanctions.expiresAt, now),
        ),
      );
    if (s) throw err.forbidden('FORBIDDEN', 'Participación suspendida en este mundo');
  }
  return a;
}
