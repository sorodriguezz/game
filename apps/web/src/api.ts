import {
  API_PREFIX,
  CSRF_HEADER,
  IDEMPOTENCY_HEADER,
  type ApiErrorBody,
  type BattleConfigView,
  type BattleReportDetail,
  type CreateTrainingMatchRequest,
  type JoinTicketResponse,
  type JoinTrainingMatchRequest,
  type TrainingMatchView,
  type BattleReportSummary,
  type BuildRequest,
  type BuildResponse,
  type DoctrineRequest,
  type DoctrineView,
  type JoinWorldRequest,
  type JoinWorldResponse,
  type LoginRequest,
  type MapRegionView,
  type MeResponse,
  type RecruitRequest,
  type RecruitResponse,
  type RegisterRequest,
  type SendMovementRequest,
  type SendMovementResponse,
  type VillageView,
  type WorldSummary,
  type TerritoryView,
  type FoundVillageRequest,
  type RepairWallRequest,
  type RepairWallResponse,
  type StaffOverview,
  type ModerationWorld,
  type AccountRole,
  type MapAtlasView,
  type DevelopmentRequest,
  type DevelopmentOrderView,
  type TradeMarketView,
  type TradeSendRequest,
  type TradeOfferRequest,
  type TradeRouteRequest,
} from '@reinos/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }
  get code() {
    return this.body.code;
  }
}

let csrfToken: string | null = null;
export const setCsrf = (t: string | null) => {
  csrfToken = t;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente HTTP. Las mutaciones llevan CSRF y una Idempotency-Key estable por
 * intento lógico: si se reintenta (red o EVENTS_PENDING) se reutiliza la misma
 * clave, por lo que el servidor nunca duplica el efecto (ADR-006).
 */
async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotent = false,
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers[CSRF_HEADER] = csrfToken;
  if (idempotent) headers[IDEMPOTENCY_HEADER] = crypto.randomUUID();
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_PREFIX}${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      if (attempt < 2) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw new ApiError(0, {
        code: 'INTERNAL_ERROR',
        message: 'Sin conexión con el servidor',
        correlationId: '-',
      });
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return data as T;
    const err = new ApiError(
      res.status,
      (data as ApiErrorBody) ?? {
        code: 'INTERNAL_ERROR',
        message: res.statusText,
        correlationId: '-',
      },
    );
    if ((err.code === 'EVENTS_PENDING' || err.code === 'CONCURRENT_MODIFICATION') && attempt < 4) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    throw err;
  }
}

const w = (worldId: string) => `/worlds/${worldId}`;
const v = (worldId: string, villageId: string) => `${w(worldId)}/villages/${villageId}`;

export const api = {
  market: (worldId: string, villageId: string) =>
    call<TradeMarketView>('GET', `${v(worldId, villageId)}/market`),
  tradeSend: (worldId: string, villageId: string, body: TradeSendRequest) =>
    call('POST', `${v(worldId, villageId)}/market/send`, body, true),
  tradeOffer: (worldId: string, villageId: string, body: TradeOfferRequest) =>
    call('POST', `${v(worldId, villageId)}/market/offers`, body, true),
  tradeAccept: (worldId: string, villageId: string, offerId: string, lots: number) =>
    call('POST', `${v(worldId, villageId)}/market/accept`, { offerId, lots }, true),
  tradeCancel: (worldId: string, villageId: string, offerId: string) =>
    call('POST', `${v(worldId, villageId)}/market/offers/${offerId}/cancel`, {}, true),
  tradeRoute: (worldId: string, villageId: string, body: TradeRouteRequest) =>
    call('POST', `${v(worldId, villageId)}/market/routes`, body, true),
  tradeStopRoute: (worldId: string, villageId: string, routeId: string) =>
    call('POST', `${v(worldId, villageId)}/market/routes/${routeId}/disable`, {}, true),
  celebrate: (worldId: string, villageId: string) =>
    call('POST', `${v(worldId, villageId)}/celebrations`, {}, true),
  management: () => call<StaffOverview>('GET', '/management'),
  managedWorld: (id: string) => call<ModerationWorld>('GET', `/management/worlds/${id}`),
  createUser: (b: { email: string; password: string; displayName: string; role: AccountRole }) =>
    call('POST', '/management/users', b, true),
  updateUser: (id: string, b: unknown) => call('PATCH', `/management/users/${id}`, b, true),
  createWorld: (b: unknown) => call('POST', '/management/worlds', b, true),
  updateWorld: (id: string, b: unknown) => call('PUT', `/management/worlds/${id}`, b, true),
  worldAction: (id: string, action: string) =>
    call('POST', `/management/worlds/${id}/actions`, { action }, true),
  assignModerator: (id: string, accountId: string, assigned: boolean) =>
    call('PUT', `/management/worlds/${id}/moderators/${accountId}`, { assigned }, true),
  announce: (id: string, b: unknown) =>
    call('POST', `/management/worlds/${id}/announcements`, b, true),
  reviewComplaint: (worldId: string, id: string, b: unknown) =>
    call('PATCH', `/management/worlds/${worldId}/complaints/${id}`, b, true),
  sanction: (id: string, b: unknown) => call('POST', `/management/worlds/${id}/sanctions`, b, true),
  complain: (id: string, b: unknown) => call('POST', `${w(id)}/complaints`, b, true),
  me: () => call<MeResponse>('GET', '/auth/me'),
  register: (b: RegisterRequest) => call<MeResponse>('POST', '/auth/register', b),
  login: (b: LoginRequest) => call<MeResponse>('POST', '/auth/login', b),
  logout: () => call<void>('POST', '/auth/logout'),
  worlds: () => call<WorldSummary[]>('GET', '/worlds'),
  worldOverview: (worldId: string) =>
    call<{ mapSize: number; resolution: number; tiles: string }>('GET', `${w(worldId)}/overview`),
  atlas: (worldId: string) => call<MapAtlasView>('GET', `${w(worldId)}/atlas`),
  atlasTerrain: async (worldId: string) => {
    const response = await fetch(`${API_PREFIX}${w(worldId)}/atlas/terrain`, {
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('No se pudo cargar el mapa completo');
    return new Uint8Array(await response.arrayBuffer());
  },
  join: (worldId: string, b: JoinWorldRequest) =>
    call<JoinWorldResponse>('POST', `${w(worldId)}/join`, b, true),
  village: (worldId: string, villageId: string) => call<VillageView>('GET', v(worldId, villageId)),
  repairWall: (worldId: string, villageId: string, b: RepairWallRequest) =>
    call<RepairWallResponse>('POST', `${v(worldId, villageId)}/wall-repairs`, b, true),
  develop: (worldId: string, villageId: string, b: DevelopmentRequest) =>
    call<DevelopmentOrderView>('POST', `${v(worldId, villageId)}/development`, b, true),
  build: (worldId: string, villageId: string, b: BuildRequest) =>
    call<BuildResponse>('POST', `${v(worldId, villageId)}/buildings`, b, true),
  recruit: (worldId: string, villageId: string, b: RecruitRequest) =>
    call<RecruitResponse>('POST', `${v(worldId, villageId)}/recruitments`, b, true),
  doctrine: (worldId: string, villageId: string, b: DoctrineRequest) =>
    call<DoctrineView>('PUT', `${v(worldId, villageId)}/doctrine`, b),
  march: (worldId: string, villageId: string, b: SendMovementRequest) =>
    call<SendMovementResponse>('POST', `${v(worldId, villageId)}/movements`, b, true),
  map: (
    worldId: string,
    x: number,
    y: number,
    radius: number,
    viewport?: { width: number; height: number },
  ) =>
    call<MapRegionView>(
      'GET',
      `${w(worldId)}/map?x=${x}&y=${y}&radius=${radius}${viewport ? `&width=${viewport.width}&height=${viewport.height}` : ''}`,
    ),
  reports: (worldId: string) => call<BattleReportSummary[]>('GET', `${w(worldId)}/reports`),
  report: (worldId: string, battleId: string) =>
    call<BattleReportDetail>('GET', `${w(worldId)}/reports/${battleId}`),
  territory: (worldId: string) => call<TerritoryView>('GET', `${w(worldId)}/territory`),
  found: (worldId: string, villageId: string, body: FoundVillageRequest) =>
    call<{ id: string; arrivesAt: string }>(
      'POST',
      `${v(worldId, villageId)}/settlements`,
      body,
      true,
    ),
  alliance: (worldId: string, body: { name: string } | { inviteCode: string }) =>
    call<{ id: string }>('POST', `${w(worldId)}/alliance`, body, true),
  recall: (worldId: string, villageId: string, originId: string) =>
    call<{ id: string; arrivesAt: string }>(
      'POST',
      `${v(worldId, villageId)}/recall/${originId}`,
      {},
      true,
    ),
  // MVP 2 — entrenamiento táctico
  battleConfig: () => call<BattleConfigView>('GET', '/battle-config'),
  trainings: () => call<TrainingMatchView[]>('GET', '/training'),
  createTraining: (b: CreateTrainingMatchRequest) =>
    call<TrainingMatchView>('POST', '/training', b),
  joinTraining: (code: string, b: JoinTrainingMatchRequest) =>
    call<TrainingMatchView>('POST', `/training/join/${encodeURIComponent(code)}`, b),
  training: (id: string) => call<TrainingMatchView>('GET', `/training/${id}`),
  trainingTicket: (id: string) => call<JoinTicketResponse>('POST', `/training/${id}/join-ticket`),
};

/** Mensajes de error comprensibles por código (la UI nunca depende del texto del servidor). */
export function describeError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Error inesperado';
  const map: Partial<Record<string, string>> = {
    INSUFFICIENT_RESOURCES: 'Recursos insuficientes.',
    CONSTRUCTION_QUEUE_BUSY: 'Ya hay una construcción en curso.',
    REQUIREMENTS_NOT_MET: 'No se cumplen los requisitos.',
    POPULATION_LIMIT: 'Población insuficiente: mejora el centro urbano.',
    INSUFFICIENT_TROOPS: 'No tienes tantas tropas disponibles.',
    TARGET_PROTECTED: 'El objetivo está bajo protección de principiante.',
    TARGET_INVALID: 'Objetivo inválido.',
    STARVATION: 'Hambruna: sin alimentos no puedes reclutar.',
    INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
    EMAIL_TAKEN: 'Ese correo ya está registrado.',
    DISPLAY_NAME_TAKEN: 'Ese nombre ya está en uso.',
    VALIDATION_FAILED: 'Revisa los datos introducidos.',
    RATE_LIMITED: 'Demasiadas peticiones, espera un momento.',
    EVENTS_PENDING: 'Hay un combate resolviéndose en tu aldea; reintenta.',
    NOT_COASTAL: 'El puerto solo puede construirse en aldeas costeras.',
    CIVILIZATION_RESTRICTED: 'Exclusivo de otra civilización.',
    FEATURE_DISABLED: 'El entrenamiento táctico está desactivado.',
    BATTLE_SERVER_UNAVAILABLE: 'El servidor táctico no está disponible ahora mismo.',
    ROOM_AT_CAPACITY: 'Todas las salas tácticas están ocupadas; reintenta en unos minutos.',
    MATCH_NOT_JOINABLE: 'Código no válido, caducado o partida ya ocupada.',
  };
  return map[e.code] ?? e.message;
}
