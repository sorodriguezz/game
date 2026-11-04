# ADR-0024: Snapshots inmutables, reservas de tropas y concurrencia

**Estado:** Propuesto (por aceptar en implementación)  
**Fecha:** 2026-11-04  
**Alcance:** MVP 2 · Referencia: PRD_MVP2.md

**Contexto:** dos ataques pueden llegar a la misma ciudad; durante una sala de 5 min siguen ocurriendo reclutamientos, refuerzos y eventos económicos.

**Decisión:** al vencimiento de movimiento, capturar snapshot inmutable (`rulesetVersion`, `seed`, unidades, doctina, tecnología, defensas). Reservar solo tropas comprometidas en tablas M1/tabla de reservas bajo transacción con lock/versión. Serializar asignación de guarnición por orden canónico; nuevos encuentros que no puedan reservar se convierten a AUTO o siguen política explícita. No bloquear toda la ciudad.

**Alternativas:** congelar aldea completa (mala UX); confiar en cantidades client-side (duplicación); colas sin bloqueos DB (carreras).

**Consecuencias:** mayores restricciones y código transaccional, pero coherencia entre mundo y sala.

**Invariantes / pruebas:** suma de tropas libres + reservadas + perdidas/trasladadas se conserva; dos ataques simultáneos; refuerzo a mitad de combate; crash posterior a reserva; reconciliador libera únicamente reservas no comprometidas.

**Revisar si:** las batallas de muchos bandos requieren un modelo de reservas multientidad más elaborado.
