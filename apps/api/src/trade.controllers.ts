import { Controller, Get, Post, Body, Headers, Inject, Param } from '@nestjs/common';
import {
  TradeService,
  indexedMapQuery,
  type CoreContext,
  type ResolvedSession,
} from '@reinos/core';
import {
  IDEMPOTENCY_HEADER,
  tradeSendSchema,
  tradeRouteSchema,
  tradeAcceptSchema,
} from '@reinos/contracts';
import { CORE_CONTEXT } from './tokens.js';
import { CurrentSession, uuidParam } from './http.js';
@Controller('worlds/:worldId/villages/:villageId/market')
export class TradeController {
  private readonly service: TradeService;
  constructor(@Inject(CORE_CONTEXT) private readonly ctx: CoreContext) {
    this.service = new TradeService(ctx);
  }
  @Get() view(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
  ) {
    return this.service.view(
      s.account.id,
      uuidParam(w, 'WORLD_NOT_FOUND'),
      uuidParam(v, 'VILLAGE_NOT_FOUND'),
    );
  }
  @Post('send') async send(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Body() input: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    const req = tradeSendSchema.parse(input),
      point = await indexedMapQuery(this.ctx.db, uuidParam(w, 'WORLD_NOT_FOUND'), {
        x: req.x,
        y: req.y,
        radius: 1,
      });
    return this.service.send(
      { accountId: s.account.id },
      w,
      uuidParam(v, 'VILLAGE_NOT_FOUND'),
      { ...req, x: point.x, y: point.y },
      key,
    );
  }
  @Post('offers') offer(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Body() input: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.offer(
      { accountId: s.account.id },
      uuidParam(w, 'WORLD_NOT_FOUND'),
      uuidParam(v, 'VILLAGE_NOT_FOUND'),
      input as never,
      key,
    );
  }
  @Post('accept') accept(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Body() input: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.accept(
      { accountId: s.account.id },
      uuidParam(w, 'WORLD_NOT_FOUND'),
      uuidParam(v, 'VILLAGE_NOT_FOUND'),
      tradeAcceptSchema.parse(input),
      key,
    );
  }
  @Post('offers/:offerId/cancel') cancel(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Param('offerId') offer: string,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.cancelOffer(
      { accountId: s.account.id },
      uuidParam(w, 'WORLD_NOT_FOUND'),
      uuidParam(v, 'VILLAGE_NOT_FOUND'),
      uuidParam(offer, 'NOT_FOUND'),
      key,
    );
  }
  @Post('routes') async route(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Body() input: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    const req = tradeRouteSchema.parse(input),
      point = await indexedMapQuery(this.ctx.db, uuidParam(w, 'WORLD_NOT_FOUND'), {
        x: req.x,
        y: req.y,
        radius: 1,
      });
    return this.service.route(
      { accountId: s.account.id },
      w,
      uuidParam(v, 'VILLAGE_NOT_FOUND'),
      { ...req, x: point.x, y: point.y },
      key,
    );
  }
  @Post('routes/:routeId/disable') disable(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') w: string,
    @Param('villageId') v: string,
    @Param('routeId') route: string,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.disableRoute(
      { accountId: s.account.id },
      uuidParam(w, 'WORLD_NOT_FOUND'),
      uuidParam(v, 'VILLAGE_NOT_FOUND'),
      uuidParam(route, 'NOT_FOUND'),
      key,
    );
  }
}
