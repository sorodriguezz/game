import { and, eq, gt, isNull } from 'drizzle-orm';
import { hash, verify } from '@node-rs/argon2';
import { accounts, sessions } from '@reinos/db';
import {
  loginRequestSchema,
  registerRequestSchema,
  type AccountView,
  type LoginRequest,
  type RegisterRequest,
} from '@reinos/contracts';
import { DomainError, err, type CoreContext } from './context.js';
import { newId, pgConstraint, pgErrorCode, randomToken, sha256 } from './util.js';

/** Parámetros Argon2id (OWASP 2024: m=19 MiB, t=2, p=1). `algorithm` 2 = Argon2id. */
const ARGON2 = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;

export interface SessionResult {
  account: AccountView;
  /** Token opaco para la cookie HttpOnly. Solo se guarda su hash. */
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export interface ResolvedSession {
  sessionId: string;
  account: AccountView;
  csrfToken: string;
}

let dummyHash: Promise<string> | undefined;

export class AuthService {
  constructor(private readonly ctx: CoreContext) {}

  async register(input: RegisterRequest): Promise<SessionResult> {
    const req = registerRequestSchema.parse(input);
    const passwordHash = await hash(req.password, ARGON2);
    const id = newId();
    try {
      await this.ctx.db.insert(accounts).values({
        id,
        email: req.email,
        displayName: req.displayName,
        passwordHash,
      });
    } catch (e) {
      if (pgErrorCode(e) === '23505') {
        const c = pgConstraint(e);
        if (c === 'accounts_email_uq') throw err.conflict('EMAIL_TAKEN', 'El correo ya está registrado');
        throw err.conflict('DISPLAY_NAME_TAKEN', 'El nombre ya está en uso');
      }
      throw e;
    }
    return this.createSession({ id, email: req.email, displayName: req.displayName });
  }

  async login(input: LoginRequest): Promise<SessionResult> {
    const req = loginRequestSchema.parse(input);
    const [acc] = await this.ctx.db.select().from(accounts).where(eq(accounts.email, req.email));
    if (!acc) {
      // Igualar coste temporal para no revelar qué correos existen.
      dummyHash ??= hash('contraseña-de-relleno', ARGON2);
      await verify(await dummyHash, req.password).catch(() => false);
      throw new DomainError('INVALID_CREDENTIALS', 401, 'Credenciales inválidas');
    }
    const ok = await verify(acc.passwordHash, req.password).catch(() => false);
    if (!ok || acc.status !== 'ACTIVE') throw new DomainError('INVALID_CREDENTIALS', 401, 'Credenciales inválidas');
    return this.createSession({ id: acc.id, email: acc.email, displayName: acc.displayName });
  }

  private async createSession(account: AccountView): Promise<SessionResult> {
    const token = randomToken();
    const csrfToken = randomToken(24);
    const now = this.ctx.clock.now();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.ctx.db.insert(sessions).values({
      id: newId(),
      accountId: account.id,
      tokenHash: sha256(token),
      csrfToken,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    });
    return { account, token, csrfToken, expiresAt };
  }

  async resolve(token: string | undefined): Promise<ResolvedSession | null> {
    if (!token || token.length > 200) return null;
    const now = this.ctx.clock.now();
    const rows = await this.ctx.db
      .select({
        sessionId: sessions.id,
        csrfToken: sessions.csrfToken,
        id: accounts.id,
        email: accounts.email,
        displayName: accounts.displayName,
        status: accounts.status,
      })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
    const s = rows[0];
    if (!s || s.status !== 'ACTIVE') return null;
    return {
      sessionId: s.sessionId,
      csrfToken: s.csrfToken,
      account: { id: s.id, email: s.email, displayName: s.displayName },
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.ctx.db.update(sessions).set({ revokedAt: this.ctx.clock.now() }).where(eq(sessions.id, sessionId));
  }
}
