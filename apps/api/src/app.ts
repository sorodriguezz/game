import 'reflect-metadata';
import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ThrottlerGuard,
  ThrottlerModule,
  getOptionsToken,
  getStorageToken,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '@reinos/contracts';
import {
  AuthService,
  GameCommands,
  GameQueries,
  TrainingService,
  type CoreContext,
} from '@reinos/core';
import {
  AuthController,
  HealthController,
  VillagesController,
  WorldsController,
} from './controllers.js';
import {
  ApiExceptionFilter,
  SessionGuard,
  requestIdMiddleware,
  securityHeadersMiddleware,
} from './http.js';
import {
  BattleConfigController,
  InternalTrainingController,
  TrainingController,
} from './tactical.controllers.js';
import {
  API_CONFIG,
  AUTH_SERVICE,
  CORE_CONTEXT,
  GAME_COMMANDS,
  GAME_QUERIES,
  TRAINING_SERVICE,
  type ApiConfig,
} from './tokens.js';

/**
 * Construye la aplicación Nest con un `CoreContext` inyectado (BD, reloj, logger).
 * Los tests e2e la crean con un reloj falso y la BD de pruebas.
 */
export async function createApp(
  ctx: CoreContext,
  config: ApiConfig,
  training?: TrainingService,
): Promise<INestApplication> {
  @Module({
    imports: [
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: config.rateLimitPerMinute }]),
    ],
    controllers: [
      HealthController,
      AuthController,
      WorldsController,
      VillagesController,
      BattleConfigController,
      TrainingController,
      InternalTrainingController,
    ],
    providers: [
      Reflector,
      { provide: CORE_CONTEXT, useValue: ctx },
      { provide: API_CONFIG, useValue: config },
      { provide: AUTH_SERVICE, useValue: new AuthService(ctx) },
      { provide: GAME_COMMANDS, useValue: new GameCommands(ctx) },
      { provide: GAME_QUERIES, useValue: new GameQueries(ctx) },
      {
        provide: TRAINING_SERVICE,
        useValue:
          training ??
          new TrainingService(ctx, {
            enabled: false,
            signingKey: 'x'.repeat(32),
            publicBattleServerUrl: '',
            gateway: {
              createRoom: () => Promise.reject(new Error('sin battle-server')),
              health: async () => ({ ok: false, capacityAvailable: false }),
            },
          }),
      },
      { provide: APP_GUARD, useClass: SessionGuard },
      {
        provide: APP_GUARD,
        // Resolver explícitamente evita mezclar tokens Reflector de ESM/CJS en tsx.
        inject: [getOptionsToken(), getStorageToken(), Reflector],
        useFactory: (
          options: ThrottlerModuleOptions,
          storage: ThrottlerStorage,
          reflector: Reflector,
        ) => new ThrottlerGuard(options, storage, reflector),
      },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
    ],
  })
  class AppModule {}

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn'],
  });
  if (config.production) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '32kb' });
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));
  await app.init();
  return app;
}
