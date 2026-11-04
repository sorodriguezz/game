import {
  ArgumentsHost,
  Catch,
  CanActivate,
  ExecutionContext,
  ExceptionFilter,
  HttpException,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import type { NextFunction, Response } from 'express';
import { ZodError } from 'zod';
import { CSRF_HEADER, SESSION_COOKIE, type ApiErrorBody, type ErrorCode } from '@reinos/contracts';
import { AuthService, DomainError, jsonLogger, newId, type ResolvedSession } from '@reinos/core';
import { API_CONFIG, AUTH_SERVICE, type ApiConfig, type GameRequest } from './tokens.js';

const log = jsonLogger({ svc: 'api' });

// ---------------------------------------------------------------------------
// Request id + log de acceso (NFR-008)
// ---------------------------------------------------------------------------
export function requestIdMiddleware(req: GameRequest, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : newId();
  res.setHeader('x-request-id', req.requestId);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const worldMatch = /\/worlds\/([0-9a-f-]{36})/.exec(req.originalUrl);
    log.info('http', {
      request_id: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
      world_id: worldMatch?.[1],
      account_id: req.session?.account.id,
    });
  });
  next();
}

/** Cabeceras de seguridad básicas (la CSP final la sirve el proxy/CDN del front). */
export function securityHeadersMiddleware(
  _req: GameRequest,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'same-origin');
  res.setHeader('cache-control', 'no-store');
  next();
}

// ---------------------------------------------------------------------------
// Sesión, CSRF y origen (ADR-0017)
// ---------------------------------------------------------------------------
export const PUBLIC_ROUTE = 'reinos:public';
/** Marca una ruta como accesible sin sesión. */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH_SERVICE) private readonly auth: AuthService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<GameRequest>();
    if (MUTATING.has(req.method)) {
      const origin = req.header('origin');
      if (origin && !this.config.allowedOrigins.includes(origin)) {
        throw new DomainError('ORIGIN_NOT_ALLOWED', 403, 'Origen no permitido');
      }
    }
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    req.session = (await this.auth.resolve(token)) ?? undefined;
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (!req.session) throw new DomainError('UNAUTHENTICATED', 401, 'Sesión requerida');
    if (MUTATING.has(req.method) && req.header(CSRF_HEADER) !== req.session.csrfToken) {
      throw new DomainError('CSRF_MISMATCH', 403, 'Token CSRF inválido');
    }
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedSession => {
    const req = ctx.switchToHttp().getRequest<GameRequest>();
    if (!req.session) throw new DomainError('UNAUTHENTICATED', 401, 'Sesión requerida');
    return req.session;
  },
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida un parámetro UUID; si no lo es, 404 (no revela estructura). */
export function uuidParam(value: string, code: ErrorCode = 'NOT_FOUND'): string {
  if (!UUID_RE.test(value)) throw new DomainError(code, 404, 'No encontrado');
  return value.toLowerCase();
}

// ---------------------------------------------------------------------------
// Formato de error uniforme (PRD §19.1)
// ---------------------------------------------------------------------------
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<GameRequest>();
    const res = ctx.getResponse<Response>();
    const correlationId = req.requestId ?? newId();
    let status = 500;
    let body: ApiErrorBody = { code: 'INTERNAL_ERROR', message: 'Error interno', correlationId };

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      body = {
        code: exception.code,
        message: exception.message,
        correlationId,
        details: exception.details,
      };
    } else if (exception instanceof ZodError) {
      status = 422;
      body = {
        code: 'VALIDATION_FAILED',
        message: 'Datos inválidos',
        correlationId,
        details: {
          issues: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      body = { code: 'RATE_LIMITED', message: 'Demasiadas peticiones', correlationId };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code: ErrorCode =
        status === 404
          ? 'NOT_FOUND'
          : status === 413 || status === 400
            ? 'VALIDATION_FAILED'
            : 'INTERNAL_ERROR';
      body = {
        code,
        message: status === 404 ? 'Ruta no encontrada' : exception.message,
        correlationId,
      };
    }
    if (status >= 500) {
      log.error('unhandled', {
        request_id: correlationId,
        error:
          exception instanceof Error
            ? `${exception.name}: ${exception.message}`
            : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }
    res.status(status).json(body);
  }
}
