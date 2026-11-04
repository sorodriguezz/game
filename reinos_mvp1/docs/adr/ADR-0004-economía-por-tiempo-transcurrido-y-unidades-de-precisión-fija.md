# ADR-0004: Economía por tiempo transcurrido y unidades de precisión fija

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Un tick por segundo por ciudad no escala bien; float introduce errores acumulativos y vulnerabilidades en saldos.

## Decisión
Persistir saldo, tasa por unidad temporal, remanente fraccionario, capacidad y `last_settled_at`. Liquidar hasta hora de servidor bajo bloqueo de la fila antes de cada cambio económico; dividir cálculos por tramos cuando tasa/capacidad cambien; usar enteros de precisión fija y ledger transaccional.

## Consecuencias positivas
- Economía persistente sin procesos continuamente activos
- Concurrencia controlable y cálculos reejecutables

## Consecuencias y riesgos
- Mayor complejidad al manejar múltiples cambios temporales
- Necesidad de pruebas de redondeo, pausas y hambre/consumo

## Alternativas evaluadas
- Tick recurrente en todas las aldeas: coste elevado
- Float y actualización client-side: inconsistencias/exploits

## Señal de revisión
Añadir escenarios de property-based testing que comprueben conservación de recursos.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
