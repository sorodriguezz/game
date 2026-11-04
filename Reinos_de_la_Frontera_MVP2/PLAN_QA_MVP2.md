# Plan de pruebas y aceptación — MVP 2.0

**Objetivo:** demostrar, con evidencia repetible, que el modo RTS no corrompe la temporada. Los tests tácticos viven junto al motor de simulación, sin depender de un navegador para validar reglas.

## 1. Niveles de prueba

| Nivel | Qué se prueba | Herramienta propuesta |
|---|---|---|
| Unit | Semillas, formaciones, daño, moral, órdenes, state machine | Vitest o Jest del repo |
| Integración DB | Reservas, única aplicación, SQL locks, migraciones | PostgreSQL en Docker + tests API |
| Contrato | DTO REST, tickets, payloads WS, versionado | JSON Schema/Zod o librería que ya use M1 |
| End-to-end | Dos clientes, aceptación, juego táctico, commit | Playwright + Colyseus local |
| Rendimiento | Tick, rooms, RTT, draw calls, FPS y carga | Script headless + profiling PlayCanvas |
| Resiliencia | Caídas/timeout/colisiones/recuperación | Fault injection en Compose |
| Seguridad | Scope mundo/temporada, token, PNA, inputs falsos | Tests adversariales de API/WS |
| Visual | LOD, rig, impactos, colisión, luces | Capturas, inspección GLB, revisión humana |
| Regresión | Todo MVP 1 | Suite M1 intacta |

## 2. Casos críticos de integridad

| ID | Acción | Resultado requerido |
|---|---|---|
| INT-001 | Dos requests `ACCEPT` iguales | Idempotente, una aceptación |
| INT-002 | Un jugador acepta y el otro no | AUTO a vencimiento |
| INT-003 | Ambos aceptan después de vencimiento | Ninguna room; AUTO |
| INT-004 | Ataque de otro mundo | Rechazado y auditado |
| INT-005 | Atacar alianza con PNA activo | Rechazado según reglas de mundo |
| INT-006 | Dos ataques simultáneos a guarnición | Ninguna tropa reservada dos veces |
| INT-007 | Intento de mover tropas ya reservadas | Rechazado |
| INT-008 | Resultado enviado 3 veces | Bajas/botín aplicados una sola vez |
| INT-009 | Dos resultados distintos con mismo ID | Incidente y cuarentena; no sobrescribe |
| INT-010 | Reinicio API tras resultado preparado | Commit se reintenta sin duplicación |
| INT-011 | Worker cae tras marcar evento | Reconciliación procesa exactamente una consecuencia |
| INT-012 | Cierre de mundo nivel 100 concurrente | No se altera ganador por sala pendiente |
| INT-013 | TRAINING envía resultado al endpoint real | Rechazado; cero mutaciones del mundo |
| INT-014 | Battle-server apagado | Entradas nuevas pasan a AUTO |
| INT-015 | Cambio de temporada en sala | Política documentada, sin aplicar a temporada nueva |
| INT-016 | Participación en táctica | No otorga puntuación extra fuera de bajas/daño canónicos |
| INT-017 | Resultado táctico más hospital/sacerdote | Heridos con límites correctos, sin resurrección |
| INT-018 | Rechazo/PNA/confederación | Diplomacia y avisos siguen consistentes |

## 3. Tests adversariales de red

| ID | Riesgo | Prueba |
|---|---|---|
| NET-001 | Ticket usado dos veces | Segundo intento denegado |
| NET-002 | Ticket de otra sala/mundo | Denegado |
| NET-003 | Ticket expirado | Denegado |
| NET-004 | WS sin TLS en entorno público | Bloqueado por política de despliegue |
| NET-005 | Spam 100 órdenes/s | Rate limit, no bloqueo de simulación |
| NET-006 | `MOVE` fuera de mapa / NaN / Infinity | Rechazado sin modificar estado |
| NET-007 | `ATTACK` propia tropa o fog no visible | Rechazo por reglas |
| NET-008 | `seq` duplicado/desordenado | Política monotónica, sin repetición |
| NET-009 | Cliente falsifica HP/tropas | Ignorado, estado solo servidor |
| NET-010 | Cliente abandona a mitad | Doctrina automática; reconexión si corresponde |
| NET-011 | Reload del navegador | Reingreso con token si está vigente |
| NET-012 | Kill -9 de Colyseus | Watchdog resuelve mediante checkpoint o AUTO |
| NET-013 | Falla WSS / timeout proxy | No sala colgada indefinidamente |
| NET-014 | Espectador de otra alianza | Sin acceso a visibilidad restringida |
| NET-015 | Replay antes de publicarse | Acceso denegado |

## 4. Tests del motor RTS

- Simular el mismo encuentro con semilla/version y secuencia ordenada; comparar checksums de estados críticos en el mismo runtime.
- Ejecutar property-based tests: no cantidad negativa, no moral infinita, daño limitado, no movimiento imposible, fin en <= límite de ticks.
- Correr 1.000 encuentros sintéticos con formaciones y terrenos distintos; publicar distribuciones por civilización para detectar sesgos.
- Probar obstáculos, puertas, agua, pendientes y ausencia de ruta.
- Probar ticks lentos, backlog y catch-up controlado; prohibir acelerar resultados por frame rate cliente.
- Verificar que retirar una formación no la duplica en el mundo ni crea escapes fuera de los límites.

## 5. Prueba de carga (plantilla)

**Equipo de referencia:** completar CPU, RAM, SO, Node, Colyseus y PlayCanvas usados. **No afirmar capacidad sin ejecutar.**

| Escenario | Rooms | Formaciones / room | Duración | Medidas |
|---|---:|---:|---|---|
| Base | 1 | 8 | 10 min | Tick p95, CPU/RAM, RTT, FPS |
| Normal | 2 | 16 | 15 min | Red, desconexiones, commits |
| Objetivo | 4 | 24 | 20 min | Tick backlog, CPU/RAM, errores |
| Saturación | 8 | 24 | 10 min | Tasa fallback, impacto API M1 |

Fijar límites de simultaneidad según resultados. El valor `TACTICAL_MAX_ROOMS=2` del ejemplo es conservador hasta medir.

## 6. QA visual para recursos 3D

- [ ] Meshes sin agujeros flotantes, proporciones medievales reconocibles; no cubos de placeholder publicados.
- [ ] PBR consistente, texturas empaquetadas, pivote y orientación de huesos correctos.
- [ ] Clips de `idle`, `move`, `attack`, `hit`, `death` y `retreat` disponibles/revisados.
- [ ] LOD evita popping intolerable y mantiene silueta legible.
- [ ] Unidades seleccionables y diferenciables por civilización/facción.
- [ ] Animaciones de arquero y proyectil no contradicen eventos de impacto del servidor.
- [ ] Capturas reales 1920×1080 y 1366×768 con ajustes gráficos distintos.
- [ ] Comparar arte final con guía artística aprobada; revisión humana registrada.

## 7. Matriz final de release

Un build MVP 2 solo puede habilitarse en un mundo beta cuando cumple **todos**:

- [ ] Suite M1 íntegra aprobada.
- [ ] Gate 0–3 cerrados con enlaces a evidencia real.
- [ ] INT-001..018 y NET-001..015 aprobados.
- [ ] Reintento idempotente comprobado ante cortes de API y PostgreSQL.
- [ ] Feature flag y rollback ensayados con salas activas.
- [ ] Dos civiles/alianzas no cruzan mundos ni PNA.
- [ ] Maravilla nivel 100 y premiación semanal siguen cerrando normal.
- [ ] Test de carga firmado con capacidad inicial y presupuesto.
- [ ] Runbooks operacionales y alertas mínimas habilitados.
- [ ] Assets auditados con procedencia/permiso de uso comercial.

## 8. Evidencia que entrega la IA por historia

1. `git diff` y ADR/FR vinculadas.
2. Salida real de comandos de tests + dependencias/versión.
3. Capturas originales de la app ejecutada y logs de render para historias 3D.
4. Reporte corto de rendimiento, incertidumbres y regresiones.
5. Declaración explícita de pruebas NO ejecutadas. Nunca inventar éxito.
