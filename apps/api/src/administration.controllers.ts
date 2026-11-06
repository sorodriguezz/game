import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { IDEMPOTENCY_HEADER, worldActionSchema } from '@reinos/contracts';
import { AdministrationService, type CoreContext, type ResolvedSession } from '@reinos/core';
import { CurrentSession, uuidParam } from './http.js';
import { CORE_CONTEXT } from './tokens.js';

@Controller('management')
export class AdministrationController {
  private readonly service: AdministrationService;
  constructor(@Inject(CORE_CONTEXT) ctx: CoreContext) {
    this.service = new AdministrationService(ctx);
  }
  @Get() overview(@CurrentSession() s: ResolvedSession) {
    return this.service.overview(s.account.id);
  }
  @Post('users') createUser(
    @CurrentSession() s: ResolvedSession,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.createUser(s.account.id, b, key);
  }
  @Patch('users/:id') updateUser(
    @CurrentSession() s: ResolvedSession,
    @Param('id') id: string,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.updateUser(s.account.id, uuidParam(id), b, key);
  }
  @Post('worlds') createWorld(
    @CurrentSession() s: ResolvedSession,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.createWorld(s.account.id, b, key);
  }
  @Put('worlds/:id') updateWorld(
    @CurrentSession() s: ResolvedSession,
    @Param('id') id: string,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.updateWorld(s.account.id, uuidParam(id), b, key);
  }
  @Post('worlds/:id/actions') action(
    @CurrentSession() s: ResolvedSession,
    @Param('id') id: string,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.worldAction(
      s.account.id,
      uuidParam(id),
      worldActionSchema.parse(b).action,
      key,
    );
  }
  @Get('worlds/:id') details(@CurrentSession() s: ResolvedSession, @Param('id') id: string) {
    return this.service.worldDetails(s.account.id, uuidParam(id));
  }
  @Put('worlds/:id/moderators/:accountId') assign(
    @CurrentSession() s: ResolvedSession,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.assignModerator(
      s.account.id,
      uuidParam(id),
      uuidParam(accountId),
      z.object({ assigned: z.boolean() }).parse(b).assigned,
      key,
    );
  }
  @Post('worlds/:id/announcements') announce(
    @CurrentSession() s: ResolvedSession,
    @Param('id') id: string,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.announce(s.account.id, uuidParam(id), b, key);
  }
  @Patch('worlds/:id/complaints/:complaintId') review(
    @CurrentSession() s: ResolvedSession,
    @Param('id') id: string,
    @Param('complaintId') complaintId: string,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.review(s.account.id, uuidParam(id), uuidParam(complaintId), b, key);
  }
  @Post('worlds/:id/sanctions') sanction(
    @CurrentSession() s: ResolvedSession,
    @Param('id') id: string,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.sanction(s.account.id, uuidParam(id), b, key);
  }
}
@Controller('worlds/:worldId/complaints')
export class ComplaintsController {
  private readonly service: AdministrationService;
  constructor(@Inject(CORE_CONTEXT) ctx: CoreContext) {
    this.service = new AdministrationService(ctx);
  }
  @Post() complain(
    @CurrentSession() s: ResolvedSession,
    @Param('worldId') worldId: string,
    @Body() b: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
  ) {
    return this.service.complain(s.account.id, uuidParam(worldId), b, key);
  }
}
