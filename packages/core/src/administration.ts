import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import {
  accounts,
  worlds,
  worldPlayers,
  worldModerators,
  adminAudit,
  worldComplaints,
  worldAnnouncements,
  worldSanctions,
  alliances,
  allianceMembers,
  type Tx,
} from '@reinos/db';
import {
  createManagedUserSchema,
  updateManagedUserSchema,
  createManagedWorldSchema,
  announcementSchema,
  resolveComplaintSchema,
  sanctionSchema,
  complaintSchema,
  type ManagedWorld,
  type ManagedUser,
  type StaffOverview,
  type ModerationWorld,
} from '@reinos/contracts';
import { requireAdmin, requireStaff, requirePlayer } from './access.js';
import { pauseCulture, resumeCulture } from './culture.js';
import { err, type CoreContext } from './context.js';
import { assertIdempotencyKey, runIdempotent } from './idempotency.js';
import { newId, iso, stableStringify, sha256, pgErrorCode } from './util.js';

export class AdministrationService {
  constructor(private readonly ctx: CoreContext) {}
  private async command<T>(
    actorId: string,
    key: string | undefined,
    action: string,
    worldId: string | null,
    input: unknown,
    fn: (tx: Tx) => Promise<T>,
    staff = false,
  ): Promise<T> {
    const requestKey = assertIdempotencyKey(key),
      requestHash = sha256(stableStringify({ action, worldId, input }));
    try {
      return await this.ctx.db.transaction(async (tx) => {
        await tx.select().from(accounts).where(eq(accounts.id, actorId)).for('no key update');
        if (staff) await requireStaff(tx, actorId, worldId ?? undefined);
        else await requireAdmin(tx, actorId);
        const [old] = await tx
          .select()
          .from(adminAudit)
          .where(and(eq(adminAudit.actorId, actorId), eq(adminAudit.requestKey, requestKey)));
        if (old) {
          if (old.requestHash !== requestHash)
            throw err.unprocessable(
              'IDEMPOTENCY_KEY_REUSED',
              'La clave pertenece a otra operación',
            );
          return old.response as T;
        }
        const response = await fn(tx);
        await tx.insert(adminAudit).values({
          id: newId(),
          actorId,
          worldId,
          action,
          requestKey,
          requestHash,
          details: response as object,
          response: response as object,
          createdAt: this.ctx.clock.now(),
        });
        return response;
      });
    } catch (e) {
      if (pgErrorCode(e) === '23505')
        throw err.conflict('VALIDATION_FAILED', 'Ya existe un usuario o nombre con esos datos');
      throw e;
    }
  }
  async createUser(actorId: string, input: unknown, key: string | undefined) {
    await requireAdmin(this.ctx.db, actorId);
    const r = createManagedUserSchema.parse(input),
      passwordHash = await hash(r.password, {
        algorithm: 2,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
    return this.command(actorId, key, 'USER_CREATED', null, r, async (tx) => {
      const id = newId();
      await tx
        .insert(accounts)
        .values({ id, email: r.email, displayName: r.displayName, role: r.role, passwordHash });
      return { id, email: r.email, displayName: r.displayName, role: r.role, status: 'ACTIVE' };
    });
  }
  async updateUser(actorId: string, id: string, input: unknown, key: string | undefined) {
    const r = updateManagedUserSchema.parse(input);
    return this.command(actorId, key, 'USER_UPDATED', null, { id, ...r }, async (tx) => {
      const [target] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, id))
        .for('no key update');
      if (!target) throw err.notFound('NOT_FOUND', 'Usuario inexistente');
      if (id === actorId && (r.status === 'DISABLED' || (r.role && r.role !== 'ADMIN')))
        throw err.forbidden('FORBIDDEN', 'No puedes retirar tu propio acceso administrativo');
      if (r.role === 'MODERATOR') {
        const [m] = await tx
          .select()
          .from(worldPlayers)
          .where(eq(worldPlayers.accountId, id))
          .limit(1);
        if (m)
          throw err.conflict(
            'NOT_ELIGIBLE',
            'La cuenta ya compite en un mundo; usa una cuenta de moderación separada',
          );
      }
      if (r.role && r.role !== 'MODERATOR')
        await tx.delete(worldModerators).where(eq(worldModerators.accountId, id));
      await tx.update(accounts).set(r).where(eq(accounts.id, id));
      return { id, ...r };
    });
  }
  async assignModerator(
    actorId: string,
    worldId: string,
    accountId: string,
    assign: boolean,
    key: string | undefined,
  ) {
    return this.command(
      actorId,
      key,
      assign ? 'MODERATOR_ASSIGNED' : 'MODERATOR_REMOVED',
      worldId,
      { accountId, assign },
      async (tx) => {
        const [a] = await tx
          .select()
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .for('no key update');
        if (!a || a.role !== 'MODERATOR' || a.status !== 'ACTIVE')
          throw err.unprocessable('VALIDATION_FAILED', 'Selecciona un Moderador activo');
        const [member] = await tx
          .select()
          .from(worldPlayers)
          .where(and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, accountId)));
        if (assign && member)
          throw err.conflict('NOT_ELIGIBLE', 'No puede moderar un mundo en el que participa');
        if (assign)
          await tx
            .insert(worldModerators)
            .values({ worldId, accountId, assignedBy: actorId, createdAt: this.ctx.clock.now() })
            .onConflictDoNothing();
        else
          await tx
            .delete(worldModerators)
            .where(
              and(eq(worldModerators.worldId, worldId), eq(worldModerators.accountId, accountId)),
            );
        return { worldId, accountId, assigned: assign };
      },
    );
  }
  async createWorld(actorId: string, input: unknown, key: string | undefined) {
    const r = createManagedWorldSchema.parse(input);
    return this.command(actorId, key, 'WORLD_CREATED', null, r, async (tx) => {
      const id = newId();
      await tx.insert(worlds).values({
        ...r,
        id,
        slug: `world-${id}`,
        status: 'DRAFT',
        profile: 'seasonal',
        rulesetVersion: r.rulesetVersion,
        opensAt: new Date(r.opensAt),
        endsAt: r.endsAt ? new Date(r.endsAt) : null,
      });
      return { id, name: r.name, status: 'DRAFT' };
    });
  }
  async updateWorld(actorId: string, id: string, input: unknown, key: string | undefined) {
    const r = createManagedWorldSchema.parse(input);
    return this.command(actorId, key, 'WORLD_UPDATED', id, r, async (tx) => {
      const [w] = await tx.select().from(worlds).where(eq(worlds.id, id)).for('no key update');
      if (!w) throw err.notFound('WORLD_NOT_FOUND');
      if (w.status !== 'DRAFT')
        throw err.conflict(
          'WORLD_NOT_OPEN',
          'Solo puede configurarse un borrador; no cambiar balance de mundos en curso',
        );
      await tx
        .update(worlds)
        .set({ ...r, opensAt: new Date(r.opensAt), endsAt: r.endsAt ? new Date(r.endsAt) : null })
        .where(eq(worlds.id, id));
      return { worldId: id, ...r };
    });
  }
  async worldAction(
    actorId: string,
    id: string,
    action: 'PUBLISH' | 'PAUSE' | 'RESUME' | 'FINISH' | 'ARCHIVE' | 'CANCEL',
    key: string | undefined,
  ) {
    return this.command(actorId, key, `WORLD_${action}`, id, { action }, async (tx) => {
      const [w] = await tx.select().from(worlds).where(eq(worlds.id, id)).for('no key update');
      if (!w) throw err.notFound('WORLD_NOT_FOUND');
      const now = this.ctx.clock.now();
      let status: typeof w.status;
      if (action === 'PUBLISH' && w.status === 'DRAFT')
        status = w.opensAt > now ? 'PLANNED' : 'OPEN';
      else if (action === 'PAUSE' && ['OPEN', 'WONDER_ERA'].includes(w.status)) {
        const overdue = await tx.execute(
          sql`select id from scheduled_events where world_id=${id} and due_at<=${iso(now)}::timestamptz and status in ('PENDING','PROCESSING') limit 1`,
        );
        if (overdue.rows.length)
          throw err.conflict(
            'EVENTS_PENDING',
            'Procesando eventos anteriores a la pausa; reintentando',
          );
        await pauseCulture(tx, w, now);
        status = 'PAUSED';
        await tx
          .update(worlds)
          .set({ pausedAt: now, resumeStatus: w.status })
          .where(eq(worlds.id, id));
      } else if (action === 'RESUME' && w.status === 'PAUSED') {
        const delay = now.getTime() - (w.pausedAt?.getTime() ?? now.getTime());
        for (const table of [
          'construction_orders',
          'recruitment_orders',
          'wall_repair_orders',
          'development_orders',
          'celebrations',
        ])
          await tx.execute(
            sql`update ${sql.identifier(table)} set started_at=started_at+${delay}*interval '1 millisecond',completes_at=completes_at+${delay}*interval '1 millisecond' where world_id=${id} and status='IN_PROGRESS'`,
          );
        await tx.execute(
          sql`update settlement_orders set departed_at=departed_at+${delay}*interval '1 millisecond',arrives_at=arrives_at+${delay}*interval '1 millisecond' where world_id=${id} and status='IN_PROGRESS'`,
        );
        await tx.execute(
          sql`update army_movements set departed_at=departed_at+${delay}*interval '1 millisecond',arrives_at=arrives_at+${delay}*interval '1 millisecond',returns_at=returns_at+${delay}*interval '1 millisecond' where world_id=${id} and status<>'COMPLETED'`,
        );
        await tx.execute(
          sql`update trade_trips set departed_at=departed_at+${delay}*interval '1 millisecond',arrives_at=arrives_at+${delay}*interval '1 millisecond',returns_at=returns_at+${delay}*interval '1 millisecond' where world_id=${id} and status<>'COMPLETED'`,
        );
        await tx.execute(
          sql`update trade_routes set next_at=next_at+${delay}*interval '1 millisecond' where world_id=${id} and enabled`,
        );
        await tx.execute(
          sql`update resource_accounts set last_settled_at=last_settled_at+${delay}*interval '1 millisecond',starvation_at=starvation_at+${delay}*interval '1 millisecond' where world_id=${id}`,
        );
        await tx.execute(
          sql`update scheduled_events set due_at=due_at+${delay}*interval '1 millisecond',available_at=available_at+${delay}*interval '1 millisecond',status='PENDING',lease_owner=null,lease_until=null where world_id=${id} and status in ('PENDING','PROCESSING')`,
        );
        await tx.execute(
          sql`update world_players set protection_until=protection_until+${delay}*interval '1 millisecond' where world_id=${id} and protection_until>${iso(w.pausedAt!)}::timestamptz`,
        );
        await resumeCulture(tx, w, now);
        status = w.resumeStatus === 'WONDER_ERA' ? 'WONDER_ERA' : 'OPEN';
        await tx
          .update(worlds)
          .set({
            pausedAt: null,
            resumeStatus: null,
            endsAt: w.endsAt ? new Date(w.endsAt.getTime() + delay) : null,
          })
          .where(eq(worlds.id, id));
      } else if (action === 'FINISH' && ['OPEN', 'WONDER_ERA'].includes(w.status)) {
        status = 'FINALIZING';
        await tx.update(worlds).set({ endsAt: now }).where(eq(worlds.id, id));
      } else if (action === 'ARCHIVE' && w.status === 'FINISHED') status = 'ARCHIVED';
      else if (action === 'CANCEL' && ['DRAFT', 'PLANNED'].includes(w.status)) status = 'CANCELLED';
      else throw err.conflict('WORLD_NOT_OPEN', 'Transición de mundo no permitida');
      await tx.update(worlds).set({ status }).where(eq(worlds.id, id));
      return { worldId: id, status };
    });
  }
  async advanceWorlds() {
    const now = iso(this.ctx.clock.now());
    await this.ctx.db.execute(
      sql`update worlds set status='OPEN' where status='PLANNED' and opens_at<=${now}::timestamptz`,
    );
    await this.ctx.db.execute(
      sql`update worlds set status='FINALIZING' where status in ('OPEN','WONDER_ERA') and ends_at<=${now}::timestamptz`,
    );
    await this.ctx.db.execute(
      sql`update worlds w set status='FINISHED' where status='FINALIZING' and not exists(select 1 from scheduled_events e where e.world_id=w.id and e.due_at<=w.ends_at and e.status<>'DONE')`,
    );
  }
  async overview(actorId: string): Promise<StaffOverview> {
    const actor = await requireStaff(this.ctx.db, actorId),
      db = this.ctx.db;
    const assigned =
      actor.role === 'MODERATOR'
        ? await db.select().from(worldModerators).where(eq(worldModerators.accountId, actorId))
        : null;
    const ws = await db
      .select()
      .from(worlds)
      .where(
        assigned
          ? inArray(
              worlds.id,
              assigned.map((a) => a.worldId),
            )
          : undefined,
      )
      .orderBy(desc(worlds.createdAt));
    const ids = ws.map((w) => w.id),
      members = await db.select().from(worldPlayers).where(inArray(worldPlayers.worldId, ids));
    const mods = await db
      .select({
        worldId: worldModerators.worldId,
        id: accounts.id,
        displayName: accounts.displayName,
      })
      .from(worldModerators)
      .innerJoin(accounts, eq(accounts.id, worldModerators.accountId))
      .where(inArray(worldModerators.worldId, ids));
    const idArray = `{${ids.join(',')}}`;
    const counts = await db.execute(
      sql`select world_id,count(*)::int as n from villages where world_id=any(${idArray}::uuid[]) group by world_id`,
    );
    const wc = new Map(
      (counts.rows as { world_id: string; n: number }[]).map((c) => [c.world_id, c.n]),
    );
    const managed: ManagedWorld[] = ws.map((w) => ({
      rulesetVersion: w.rulesetVersion,
      mapSeed: w.mapSeed,
      protectionHours: w.protectionHours,
      id: w.id,
      name: w.name,
      description: w.description,
      status: w.status,
      mapSize: w.mapSize,
      speedMultiplier: w.speedMultiplier,
      movementSpeedMultiplier: w.movementSpeedMultiplier,
      opensAt: iso(w.opensAt),
      endsAt: w.endsAt ? iso(w.endsAt) : null,
      players: members.filter((m) => m.worldId === w.id).length,
      villages: wc.get(w.id) ?? 0,
      moderators: mods
        .filter((m) => m.worldId === w.id)
        .map((m) => ({ id: m.id, displayName: m.displayName })),
    }));
    const users: ManagedUser[] =
      actor.role === 'ADMIN'
        ? (
            await db
              .select({
                id: accounts.id,
                email: accounts.email,
                displayName: accounts.displayName,
                role: accounts.role,
                status: accounts.status,
              })
              .from(accounts)
              .orderBy(accounts.displayName)
          ).map((a) => ({
            ...a,
            worlds: members.filter((m) => m.accountId === a.id).map((m) => m.worldId),
          }))
        : [];
    const audit = await db
      .select({
        id: adminAudit.id,
        actorName: accounts.displayName,
        action: adminAudit.action,
        worldId: adminAudit.worldId,
        createdAt: adminAudit.createdAt,
        details: adminAudit.details,
      })
      .from(adminAudit)
      .innerJoin(accounts, eq(accounts.id, adminAudit.actorId))
      .where(actor.role === 'MODERATOR' ? inArray(adminAudit.worldId, ids) : undefined)
      .orderBy(desc(adminAudit.createdAt))
      .limit(100);
    const stat = await db.execute(
      sql`select (select count(*)::int from battles where world_id=any(${idArray}::uuid[])) as battles,(select count(*)::int from army_movements where world_id=any(${idArray}::uuid[]) and status<>'COMPLETED') as movements,(select count(*)::int from world_complaints where world_id=any(${idArray}::uuid[]) and status in ('OPEN','REVIEWING','ESCALATED')) as complaints`,
    );
    const s = stat.rows[0] as { battles: number; movements: number; complaints: number };
    return {
      role: actor.role,
      worlds: managed,
      users,
      stats: {
        accounts: users.length,
        worlds: ws.length,
        players: members.length,
        villages: [...wc.values()].reduce((a, b) => a + b, 0),
        ...s,
      },
      audit: audit.map((a) => ({ ...a, createdAt: iso(a.createdAt) })),
    };
  }
  async worldDetails(actorId: string, worldId: string): Promise<ModerationWorld> {
    await requireStaff(this.ctx.db, actorId, worldId);
    const db = this.ctx.db,
      [w] = await db.select().from(worlds).where(eq(worlds.id, worldId));
    if (!w) throw err.notFound('WORLD_NOT_FOUND');
    const players = await db.execute(
      sql`select p.account_id,coalesce(p.character_name,a.display_name) as name,p.civilization,(select count(*)::int from villages v where v.world_id=p.world_id and v.owner_account_id=p.account_id and kind='PLAYER') as villages from world_players p join accounts a on a.id=p.account_id where p.world_id=${worldId}`,
    );
    const as = await db
      .select({
        id: alliances.id,
        name: alliances.name,
        members: sql<number>`(select count(*)::int from ${allianceMembers} m where m.world_id=${alliances.worldId} and m.alliance_id=${alliances.id})`,
      })
      .from(alliances)
      .where(eq(alliances.worldId, worldId));
    const complaints = await db
      .select()
      .from(worldComplaints)
      .where(eq(worldComplaints.worldId, worldId))
      .orderBy(desc(worldComplaints.createdAt))
      .limit(200);
    const announcements = await db
      .select()
      .from(worldAnnouncements)
      .where(eq(worldAnnouncements.worldId, worldId))
      .orderBy(desc(worldAnnouncements.createdAt))
      .limit(100);
    const sanctions = await db
      .select()
      .from(worldSanctions)
      .where(eq(worldSanctions.worldId, worldId))
      .orderBy(desc(worldSanctions.createdAt))
      .limit(200);
    return {
      id: w.id,
      name: w.name,
      players: (
        players.rows as {
          account_id: string;
          name: string;
          civilization: string;
          villages: number;
        }[]
      ).map((p) => ({ ...p, accountId: p.account_id })),
      alliances: as,
      complaints: complaints.map((c) => ({ ...c, createdAt: iso(c.createdAt) })),
      announcements: announcements.map((a) => ({ ...a, createdAt: iso(a.createdAt) })),
      sanctions: sanctions.map((s) => ({ ...s, expiresAt: iso(s.expiresAt) })),
    };
  }
  async announce(actorId: string, worldId: string, input: unknown, key: string | undefined) {
    const r = announcementSchema.parse(input);
    return this.command(
      actorId,
      key,
      'ANNOUNCEMENT_CREATED',
      worldId,
      r,
      async (tx) => {
        const id = newId();
        await tx
          .insert(worldAnnouncements)
          .values({ id, worldId, authorId: actorId, ...r, createdAt: this.ctx.clock.now() });
        return { id, ...r };
      },
      true,
    );
  }
  async review(
    actorId: string,
    worldId: string,
    id: string,
    input: unknown,
    key: string | undefined,
  ) {
    const r = resolveComplaintSchema.parse(input);
    return this.command(
      actorId,
      key,
      'COMPLAINT_REVIEWED',
      worldId,
      { id, ...r },
      async (tx) => {
        const rows = await tx
          .update(worldComplaints)
          .set(r)
          .where(and(eq(worldComplaints.worldId, worldId), eq(worldComplaints.id, id)))
          .returning({ id: worldComplaints.id });
        if (!rows.length) throw err.notFound('NOT_FOUND');
        return { id, ...r };
      },
      true,
    );
  }
  async sanction(actorId: string, worldId: string, input: unknown, key: string | undefined) {
    const r = sanctionSchema.parse(input);
    return this.command(
      actorId,
      key,
      'WORLD_SANCTION',
      worldId,
      r,
      async (tx) => {
        const [p] = await tx
          .select()
          .from(worldPlayers)
          .where(and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, r.accountId)));
        if (!p) throw err.notFound('NOT_A_MEMBER');
        const id = newId(),
          now = this.ctx.clock.now(),
          expiresAt = new Date(now.getTime() + r.hours * 3600000);
        await tx.insert(worldSanctions).values({
          id,
          worldId,
          actorId,
          accountId: r.accountId,
          kind: r.kind,
          reason: r.reason,
          createdAt: now,
          expiresAt,
        });
        return {
          id,
          accountId: r.accountId,
          kind: r.kind,
          reason: r.reason,
          expiresAt: iso(expiresAt),
        };
      },
      true,
    );
  }
  async complain(actorId: string, worldId: string, input: unknown, key: string | undefined) {
    const r = complaintSchema.parse(input);
    await requirePlayer(this.ctx.db, actorId);
    return this.ctx.db.transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(worldPlayers)
        .where(and(eq(worldPlayers.worldId, worldId), eq(worldPlayers.accountId, actorId)));
      if (!p) throw err.forbidden('NOT_A_MEMBER', 'No participas en este mundo');
      return (
        await runIdempotent(
          tx,
          { accountId: actorId, worldId, command: 'complaint', key: assertIdempotencyKey(key) },
          r,
          async () => {
            const id = newId();
            await tx
              .insert(worldComplaints)
              .values({ id, worldId, reporterId: actorId, ...r, createdAt: this.ctx.clock.now() });
            return { id };
          },
        )
      ).response;
    });
  }
}
