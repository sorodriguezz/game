# Arquitectura y flujos de integración — MVP 2

Esta es una **arquitectura objetivo**, no una representación de servicios ya desplegados.

## 1. Vista de componentes

```mermaid
flowchart TD
  WEB[React + PlayCanvas\nCiudad, mapa y arena] -->|HTTPS| API[NestJS API\nMundos, PNA, tropas y reservas]
  WEB -->|WSS y ticket| ROOM[Colyseus · Sala táctica\nTick y órdenes autoritativas]
  API -->|Transacciones| PG[(PostgreSQL\nFuente de verdad)]
  WORKER[NestJS Worker\nVencimientos / fallback / reconciliación] --> PG
  API -->|Ticket / snapshot| ROOM
  ROOM -->|Resultado interno autenticado| API
  WEB -->|Assets estáticos| CDN[CDN / GLB / KTX2]
  ROOM -->|Métricas / health| OBS[Logs + métricas]
  API --> OBS
```

**Propiedad de datos:** `battle-server` únicamente puede leer snapshot autorizado y enviar resultado. Las operaciones críticas sobre tablas M1 se hacen desde API/worker, dentro de transacciones PostgreSQL. El API controla capacidad, admisión y estado de encuentro.

## 2. Secuencia de ataque con ambos usuarios conectados

```mermaid
sequenceDiagram
  participant W as Worker M1
  participant D as PostgreSQL
  participant A as NestJS API
  participant U1 as Atacante
  participant U2 as Defensor
  participant C as Colyseus
  W->>D: Reclamar llegada vencida (SKIP LOCKED)
  W->>D: Snapshot inmutable + validar mundo / PNA
  W->>A: Encuentro elegible
  A-->>U1: Oferta táctica + tiempo límite
  A-->>U2: Oferta táctica + tiempo límite
  U1->>A: ACCEPT (idempotency key)
  U2->>A: ACCEPT (idempotency key)
  A->>D: Reservar tropas + estado TACTICAL_RESERVED
  A->>C: Crear sala desde snapshot + reglas
  A-->>U1: Ticket de un uso
  A-->>U2: Ticket de un uso
  U1->>C: Conectar / emitir órdenes
  U2->>C: Conectar / emitir órdenes
  C-->>U1: Snapshots / eventos
  C-->>U2: Snapshots / eventos
  C->>A: Resultado / checksum autenticado
  A->>D: Commit transaccional único del resultado
  A-->>U1: Informe + replay
  A-->>U2: Informe + replay
```

## 3. Secuencia de defensa offline / falla Colyseus

```mermaid
flowchart LR
  E[Movimiento llega] --> Q{Elegible y servidor sano?}
  Q -->|No| AUTO[Combate AUTO M1]
  Q -->|Sí| O[Oferta 20s]
  O --> R{Ambos aceptan?}
  R -->|No| AUTO
  R -->|Sí| S[Reservas + Sala Colyseus]
  S --> F{Sala finaliza?}
  F -->|Sí| C[Commit canónico]
  F -->|No / fallo fatal| REC[Checkpoint válido o fallback AUTO\ncon snapshot original]
  REC --> C
  AUTO --> C
  C --> H[Informe + rankings / premios / heridos]
```

**Clave de integridad:** no generar dos paths con dos commits, aunque el servidor táctico y el worker compitan. `battle_encounters.version` y `tactical_results.encounter_id` identifican estado/resultado.

## 4. Seguridad de fronteras

- **Web → API:** sesión del jugador ya existente en MVP 1; autorización por mundo/rol y protección CSRF aplicable.
- **API → Colyseus:** ticket de un uso, audiencia y TTL cortos; creación de sala solo por backend autorizado.
- **Web → Colyseus:** `order` es una intención, no una actualización directa del estado.
- **Colyseus → API:** endpoint interno con autenticación de servicio, red interna y verificaciones de checksum/encounter/version.
- **API → DB:** única propiedad del resultado del mundo; políticas de aislamiento de mundos.
- **CDN → Web:** solo recursos versionados con manifest/licencias; CSP y CORS configurados.
- **Blender MCP / herramientas IA:** nunca accesibles desde el juego público.

## 5. Regiones y escalado futuro

En el primer despliegue, usar un VPS que aloje procesos API, worker, PostgreSQL y `battle-server` si benchmarks lo permiten. Separar `battle-server` a otra máquina **solo** cuando interfiera con API/DB o haya suficiente demanda. Desplegar preferentemente en región cercana a los jugadores; medir latencia antes de decidir.

Si se supera un único proceso Colyseus, revisar los componentes oficiales de presence y matchmaking driver compartidos (y recién ahí un Redis/Valkey si se justifica). Esta decisión requiere benchmark, presupuesto y ADR nueva.

## 6. Invariantes de negocio transversales

1. Rechazar PNA y atacante que no pertenezca al mundo.
2. No usar un ejército ya comprometido en otro ataque/sala.
3. No permitir dos resultados aplicados para el mismo `movement_id`/`encounter_id`.
4. Rechazo de invitación nunca produce pérdida adicional.
5. No otorgar recompensas semanales por simplemente aceptar una batalla táctica.
6. Maravilla y cierre de temporada no dependen de salas en vivo.
7. `TRAINING` no escribe en `resource_ledger`, `troop_stacks` ni `ranking_snapshots`.
