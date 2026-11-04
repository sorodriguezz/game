# Backlog ejecutable — Reinos de la Frontera MVP 1

**Criterio:** completar gates secuenciales; ningún gate se aprueba solo con una imagen o demo que no use datos reales del backend.

## Gate 0 — Calidad artística y setup
- [ ] G0-01 Crear monorepo con web PlayCanvas React, API NestJS, Postgres Docker y tests.
- [ ] G0-02 Fijar guía artística por civilización, convenciones de cámara, escala y atlas de materiales.
- [ ] G0-03 Definir contratos `asset-manifest`, naming, previews y checklist de licencias.
- [ ] G0-04 Producir y aprobar castillo, granja, hospital, templo, puerto, barco, infante y arbolado.
- [ ] G0-05 Pipeline automático de inspección GLB, optimización y capturas de render.
- [ ] G0-06 Primera ciudad 3D navegable con edificios reales y selector de parcela.

**Gate aprobado:** 3D profesional coherente, buen rendimiento medido en equipo de referencia y assets auditables.

## Gate 1 — Vertical slice con dos jugadores
- [ ] G1-01 Auth seguro, `worlds`, `memberships`, inicialización de mundo.
- [ ] G1-02 Economy ledger y liquidación temporal de cuatro recursos.
- [ ] G1-03 Construcciones en parcelas y evento de finalización offline.
- [ ] G1-04 Cuartel, reclutamiento, stacks y movimiento de ejército.
- [ ] G1-05 Worker PostgreSQL `SKIP LOCKED`, idempotencia y reconciliación.
- [ ] G1-06 Combate automático determinista + doctrina offline + reporte.
- [ ] G1-07 Pruebas de carreras en ataque, gasto, finalización y reinicio.

**Gate aprobado:** dos usuarios con ciudades reales; ataque resuelto aunque el defensor esté desconectado; reinicio sin duplicados.

## Gate 2 — Mundo vivo
- [ ] G2-01 Generador de regiones con semilla, biomas, islas, ríos, costa y maravillas reservadas.
- [ ] G2-02 Mapa 3D con streaming por región y control de assets.
- [ ] G2-03 Oasis conquistables, límites y bonus de producción.
- [ ] G2-04 NPC con reglas y tres arquetipos de aldeas.
- [ ] G2-05 Puerto y barco de transporte, grafo naval, embarque/desembarque.
- [ ] G2-06 Hospital, heridos recuperables, templo y sacerdote de soporte.

**Gate aprobado:** conquistar oasis/NPC y hacer viaje marítimo sin teletransportación ni duplicaciones.

## Gate 3 — Política y competición
- [ ] G3-01 Civilizaciones 1 y 2: art assets, atributos y edificios/unidades exclusivos.
- [ ] G3-02 Alianzas/roles, solicitudes y permisos.
- [ ] G3-03 PNA con doble aprobación, activación y ruptura.
- [ ] G3-04 Confederaciones con cupo/cooldown y contribución compartida.
- [ ] G3-05 Score ledger, rankings globales, por alianzas e internos.
- [ ] G3-06 Premios semanales cosméticos, snapshots únicos y antifraude básico.

**Gate aprobado:** se verifican las tres vistas de ranking y un cierre semanal duplicado no duplica premios.

## Gate 4 — Temporada completa
- [ ] G4-01 Emplazamientos de Maravillas y reglas de desbloqueo.
- [ ] G4-02 Niveles 1–100, abastecimiento, defensa y descenso de nivel por asedio.
- [ ] G4-03 Desenlace de mundo y ventana final; un ganador en carrera simultánea.
- [ ] G4-04 Archivar mundo, clasificaciones y galería de vencedores.
- [ ] G4-05 Panel admin, reportes de abuso, reintentos, métricas y backups restaurados.
- [ ] G4-06 Test de carga objetivo alfa + protección de sesiones y recursos.

**Gate aprobado:** ejecutar una temporada acelerada en entorno test, llegar a Maravilla nivel 100, declarar un ganador y archivar sin pérdidas.

## Definition of Done
Cada historia incluye: prueba repetible, informe de ejecución, permisos/seguridad, idempotencia si hay mutación, comparación visual si hay 3D, actualización documental y revisión de PR.
