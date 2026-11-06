import { Controller, Post, Headers, Inject, Param } from '@nestjs/common';
import { CultureService, type CoreContext, type ResolvedSession } from '@reinos/core';
import { IDEMPOTENCY_HEADER } from '@reinos/contracts';
import { CORE_CONTEXT } from './tokens.js';
import { CurrentSession, uuidParam } from './http.js';
@Controller('worlds/:worldId/villages/:villageId')
export class CultureController {
  private readonly service: CultureService;
  constructor(@Inject(CORE_CONTEXT) ctx: CoreContext) {
    this.service = new CultureService(ctx);
  }
  @Post('celebrations') celebrate(
    @CurrentSession() session: ResolvedSession,
    @Param('worldId') world: string,
    @Param('villageId') village: string,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.celebrate(
      { accountId: session.account.id },
      uuidParam(world, 'WORLD_NOT_FOUND'),
      uuidParam(village, 'VILLAGE_NOT_FOUND'),
      key,
    );
  }
}
