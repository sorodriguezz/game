import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { sql } from 'drizzle-orm';
import {
  IDEMPOTENCY_HEADER,
  SESSION_COOKIE,
  type BattleReportDetail,
  type BattleReportSummary,
  type BuildResponse,
  type DoctrineView,
  type JoinWorldResponse,
  type MapRegionView,
  type MeResponse,
  type RecruitResponse,
  type SendMovementResponse,
  type VillageView,
  type WorldSummary,
} from '@reinos/contracts';
import {
  AuthService,
  GameCommands,
  GameQueries,
  type CoreContext,
  type ResolvedSession,
  type SessionResult,
} from '@reinos/core';
import { CurrentSession, Public, uuidParam } from './http.js';
import {
  API_CONFIG,
  AUTH_SERVICE,
  CORE_CONTEXT,
  GAME_COMMANDS,
  GAME_QUERIES,
  type ApiConfig,
} from './tokens.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(CORE_CONTEXT) private readonly ctx: CoreContext) {}

  @Public()
  @Get()
  async health(): Promise<{ status: 'ok'; db: 'ok'; serverTime: string }> {
    await this.ctx.db.execute(sql`select 1`);
    return { status: 'ok', db: 'ok', serverTime: this.ctx.clock.now().toISOString() };
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_SERVICE) private readonly auth: AuthService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private setCookie(res: Response, s: SessionResult): void {
    res.cookie(SESSION_COOKIE, s.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.production,
      path: '/',
      expires: s.expiresAt,
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const s = await this.auth.register(body as never);
    this.setCookie(res, s);
    return { account: s.account, csrfToken: s.csrfToken };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const s = await this.auth.login(body as never);
    this.setCookie(res, s);
    return { account: s.account, csrfToken: s.csrfToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentSession() session: ResolvedSession,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(session.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentSession() session: ResolvedSession): MeResponse {
    return { account: session.account, csrfToken: session.csrfToken };
  }
}

@Controller('worlds')
export class WorldsController {
  constructor(
    @Inject(GAME_COMMANDS) private readonly commands: GameCommands,
    @Inject(GAME_QUERIES) private readonly queries: GameQueries,
  ) {}

  @Get()
  list(@CurrentSession() s: ResolvedSession): Promise<WorldSummary[]> {
    return this.queries.listWorlds(s.account.id);
  }

  @Post(':worldId/join')
  join(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') worldId: string,
    @Body() body: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ): Promise<JoinWorldResponse> {
    return this.commands.joinWorld(
      { accountId: s.account.id },
      uuidParam(worldId, 'WORLD_NOT_FOUND'),
      body as never,
      key,
    );
  }

  @Get(':worldId/map')
  map(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') worldId: string,
    @Query() query: unknown,
  ): Promise<MapRegionView> {
    return this.queries.mapRegion(
      s.account.id,
      uuidParam(worldId, 'WORLD_NOT_FOUND'),
      query as never,
    );
  }

  @Get(':worldId/reports')
  reports(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') worldId: string,
  ): Promise<BattleReportSummary[]> {
    return this.queries.listReports(s.account.id, uuidParam(worldId, 'WORLD_NOT_FOUND'));
  }

  @Get(':worldId/reports/:battleId')
  report(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') worldId: string,
    @Param('battleId') battleId: string,
  ): Promise<BattleReportDetail> {
    return this.queries.getReport(
      s.account.id,
      uuidParam(worldId, 'WORLD_NOT_FOUND'),
      uuidParam(battleId, 'REPORT_NOT_FOUND'),
    );
  }
}

@Controller('worlds/:worldId/villages/:villageId')
export class VillagesController {
  constructor(
    @Inject(GAME_COMMANDS) private readonly commands: GameCommands,
    @Inject(GAME_QUERIES) private readonly queries: GameQueries,
  ) {}

  private ids(worldId: string, villageId: string): [string, string] {
    return [uuidParam(worldId, 'WORLD_NOT_FOUND'), uuidParam(villageId, 'VILLAGE_NOT_FOUND')];
  }

  @Get()
  view(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
  ): Promise<VillageView> {
    return this.queries.villageView(s.account.id, ...this.ids(w, v));
  }

  @Post('buildings')
  build(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Body() body: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ): Promise<BuildResponse> {
    return this.commands.startConstruction(
      { accountId: s.account.id },
      ...this.ids(w, v),
      body as never,
      key,
    );
  }

  @Post('recruitments')
  recruit(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Body() body: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ): Promise<RecruitResponse> {
    return this.commands.recruit(
      { accountId: s.account.id },
      ...this.ids(w, v),
      body as never,
      key,
    );
  }

  @Put('doctrine')
  doctrine(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Body() body: unknown,
  ): Promise<DoctrineView> {
    return this.commands.setDoctrine({ accountId: s.account.id }, ...this.ids(w, v), body as never);
  }

  @Post('movements')
  march(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Body() body: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ): Promise<SendMovementResponse> {
    return this.commands.sendMovement(
      { accountId: s.account.id },
      ...this.ids(w, v),
      body as never,
      key,
    );
  }
}
