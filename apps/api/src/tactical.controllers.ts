import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import {
  type BattleConfigView,
  type JoinTicketResponse,
  type TrainingMatchView,
} from '@reinos/contracts';
import { DEFAULT_TACTICAL_RULESET_VERSION, getTacticalRuleset } from '@reinos/game-config';
import { DomainError, TrainingService, type ResolvedSession } from '@reinos/core';
import { serviceTokenMatches } from '@reinos/tactical-sim/tickets';
import { CurrentSession, Public, uuidParam } from './http.js';
import { API_CONFIG, TRAINING_SERVICE, type ApiConfig } from './tokens.js';

/** Configuración táctica publicada (PRD-MVP2 §11): flags, límites y salud del battle-server. */
@Controller('battle-config')
export class BattleConfigController {
  private cache: { at: number; healthy: boolean } | null = null;
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  @Public()
  @Get()
  async get(): Promise<BattleConfigView> {
    if (!this.cache || Date.now() - this.cache.at > 5000) {
      const h = await this.config.tactical.health();
      this.cache = { at: Date.now(), healthy: h.ok };
    }
    const t = getTacticalRuleset(DEFAULT_TACTICAL_RULESET_VERSION);
    return {
      trainingEnabled: this.config.tactical.trainingEnabled,
      worldPvpEnabled: this.config.tactical.worldPvpEnabled,
      battleServerHealthy: this.cache.healthy,
      tacticalRulesetVersion: t.version,
      tickHz: t.timing.tickHz,
      maxRooms: 0,
      maxFormationsPerSide: t.limits.maxFormationsPerSide,
      inviteTimeoutSeconds: t.timing.inviteSeconds,
      reconnectSeconds: t.timing.reconnectSeconds,
      matchMaxSeconds: t.timing.matchMaxSeconds,
    };
  }
}

/** Entrenamiento táctico TRAINING (Gate 1): sin efectos sobre ningún mundo. */
@Controller('training')
export class TrainingController {
  constructor(@Inject(TRAINING_SERVICE) private readonly training: TrainingService) {}

  @Get()
  list(@CurrentSession() s: ResolvedSession): Promise<TrainingMatchView[]> {
    return this.training.listMine({ accountId: s.account.id });
  }

  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post()
  create(@CurrentSession() s: ResolvedSession, @Body() body: unknown): Promise<TrainingMatchView> {
    return this.training.create({ accountId: s.account.id }, body as never);
  }

  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('join/:code')
  @HttpCode(200)
  join(
    @CurrentSession() s: ResolvedSession,
    @Param('code') code: string,
    @Body() body: unknown,
  ): Promise<TrainingMatchView> {
    if (!/^[A-Za-z0-9]{6}$/.test(code))
      throw new DomainError('MATCH_NOT_JOINABLE', 409, 'Código inválido');
    return this.training.join({ accountId: s.account.id }, code, body as never);
  }

  @Get(':id')
  view(@CurrentSession() s: ResolvedSession, @Param('id') id: string): Promise<TrainingMatchView> {
    return this.training.view({ accountId: s.account.id }, uuidParam(id, 'BATTLE_NOT_FOUND'));
  }

  @Post(':id/join-ticket')
  @HttpCode(200)
  ticket(
    @CurrentSession() s: ResolvedSession,
    @Param('id') id: string,
  ): Promise<JoinTicketResponse> {
    return this.training.issueTicket(
      { accountId: s.account.id },
      uuidParam(id, 'BATTLE_NOT_FOUND'),
    );
  }
}

/**
 * Canal interno battle-server → API (ADR-0027). No usa sesión de jugador: exige
 * token de servicio; en producción además solo es accesible por red interna.
 */
@Controller('internal/training')
export class InternalTrainingController {
  constructor(
    @Inject(TRAINING_SERVICE) private readonly training: TrainingService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Public()
  @SkipThrottle()
  @Post(':id/result')
  @HttpCode(200)
  result(
    @Param('id') id: string,
    @Headers('x-service-token') token: string | undefined,
    @Body() body: unknown,
  ) {
    if (
      !this.config.tactical.serviceToken ||
      !serviceTokenMatches(token, this.config.tactical.serviceToken)
    ) {
      throw new DomainError('UNAUTHENTICATED', 401, 'Token de servicio requerido');
    }
    return this.training.recordResult(uuidParam(id, 'BATTLE_NOT_FOUND'), body);
  }
}
