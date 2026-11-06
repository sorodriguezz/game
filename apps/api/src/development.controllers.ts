import { Body, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import { IDEMPOTENCY_HEADER, type DevelopmentRequest } from '@reinos/contracts';
import { DevelopmentService, type CoreContext, type ResolvedSession } from '@reinos/core';
import { CORE_CONTEXT } from './tokens.js';
import { CurrentSession, uuidParam } from './http.js';
@Controller('worlds/:worldId/villages/:villageId/development')
export class DevelopmentController {
  private readonly service: DevelopmentService;
  constructor(@Inject(CORE_CONTEXT) ctx: CoreContext) {
    this.service = new DevelopmentService(ctx);
  }
  @Post() start(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') worldId: string,
    @Param('villageId') villageId: string,
    @Body() body: DevelopmentRequest,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.start(
      { accountId: s.account.id },
      uuidParam(worldId, 'WORLD_NOT_FOUND'),
      uuidParam(villageId, 'VILLAGE_NOT_FOUND'),
      body,
      key,
    );
  }
}
