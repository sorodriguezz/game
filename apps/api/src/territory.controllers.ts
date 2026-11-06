import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { IDEMPOTENCY_HEADER, type FoundVillageRequest } from '@reinos/contracts';
import {
  TerritoryService,
  type CoreContext,
  type ResolvedSession,
  publicTerritory,
  indexedFoundRequest,
} from '@reinos/core';
import { CurrentSession, uuidParam } from './http.js';
import { CORE_CONTEXT } from './tokens.js';
@Controller('worlds/:worldId')
export class TerritoryController {
  private readonly territory: TerritoryService;
  constructor(@Inject(CORE_CONTEXT) private readonly ctx: CoreContext) {
    this.territory = new TerritoryService(ctx);
  }
  @Get('territory') view(@CurrentSession() s: ResolvedSession, @Param('worldId') world: string) {
    return publicTerritory(
      this.ctx.db,
      world,
      this.territory.view(s.account.id, uuidParam(world, 'WORLD_NOT_FOUND')),
    );
  }
  @Post('villages/:villageId/settlements') async found(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') world: string,
    @Param('villageId') village: string,
    @Body() body: FoundVillageRequest,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.territory.found(
      { accountId: s.account.id },
      uuidParam(world, 'WORLD_NOT_FOUND'),
      uuidParam(village, 'VILLAGE_NOT_FOUND'),
      await indexedFoundRequest(this.ctx.db, world, body),
      key,
    );
  }
  @Post('alliance') alliance(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') world: string,
    @Body() body: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.territory.alliance(
      { accountId: s.account.id },
      uuidParam(world, 'WORLD_NOT_FOUND'),
      body,
      key,
    );
  }
  @Post('villages/:villageId/recall/:originId') recall(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') world: string,
    @Param('villageId') village: string,
    @Param('originId') origin: string,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.territory.recall(
      { accountId: s.account.id },
      uuidParam(world, 'WORLD_NOT_FOUND'),
      uuidParam(village, 'VILLAGE_NOT_FOUND'),
      uuidParam(origin, 'VILLAGE_NOT_FOUND'),
      key,
    );
  }
}
