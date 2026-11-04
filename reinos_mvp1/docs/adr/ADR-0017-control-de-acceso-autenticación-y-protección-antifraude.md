# ADR-0017: Control de acceso, autenticación y protección antifraude

**Estado:** Aceptado para implementación MVP 1 (propuesta de diseño)  
**Fecha:** 2026-11-03  
**Ámbito:** Reinos de la Frontera

## Contexto
Mundos compartidos y activos de usuarios requieren defensa contra ataque cliente, acciones fuera de mundo y manipulación de rankings.

## Decisión
Credenciales con Argon2id (o IdP), sesión segura en cookie HttpOnly/SameSite con CSRF cuando corresponda, límites de tasa, DTO validados, autorización por rol/propiedad/mundo, bitácora de economía y diplomacia. No confiar en coordenadas, tiempos ni saldo enviados por cliente. Admin con permisos elevados y auditoría.

## Consecuencias positivas
- Menor exposición a exploits comunes
- Acciones reconstruibles ante disputas

## Consecuencias y riesgos
- Aumenta trabajo inicial de test y flujos de sesión
- La detección de bots/multicuentas requiere políticas y monitoreo continuo

## Alternativas evaluadas
- JWT sin gestión de sesión/rotación: insuficiente
- Solo comprobación UI: insegura

## Señal de revisión
Ejecutar pruebas negativas de autorización y cross-world antes de cada release.

## Evidencia de aceptación
- Existe una prueba o escenario automatizado para el principal invariante de esta decisión.
- Se registra el impacto sobre dominio, datos, seguridad, costes y operación antes de revertirla.
- Las actualizaciones que la contradigan deben producir una nueva ADR que la sustituya.
