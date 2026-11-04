# Prompt de arranque para Claude Code o Codex

> Lee completos `AGENTS.md`, `docs/PRD-MVP1.md`, `docs/ADR-MVP1.md` y `docs/AI-SETUP-MVP1.md`.
>
> Actúa como arquitecto principal y ejecutor responsable de MVP 1 de «Reinos de la Frontera». Prioriza corrección, seguridad, bajo costo y calidad visual comprobable. No introduzcas componentes no aprobados sin documentar un ADR.
>
> **Primer objetivo:** construir el esqueleto reproducible del monorepo y un vertical slice mínimo: PlayCanvas React con una ciudad 3D real y assets GLB, NestJS + PostgreSQL, cuentas, una aldea, economía offline transaccional, construcción diferida, reclutamiento, ataque automático entre dos cuentas y un reporte. Mantén bien separadas las reglas de negocio del motor 3D.
>
> Primero realiza un diagnóstico de dependencias y compatibilidad. Expón un plan de cambios y estructura. Divide el trabajo en PR pequeños con pruebas. Implementa aislamiento por `world_id` e idempotencia desde el primer comando. No inventes que una tool está instalada; comprueba antes. Si falta un asset profesional, comienza el pipeline Blender/IA de ese asset y somételo a QA; no uses cubos como resultado final.
>
> **Gates:** typecheck/lint/tests, simulación de reintentos, capturas 3D, auditoría de licencias y documentación. No desplegar a producción ni gastar créditos de IA de pago sin aprobación expresa.
>
> Termina cada iteración con resumen de archivos cambiados, decisiones, pruebas ejecutadas, fallos pendientes, presupuesto de dependencias e instrucciones verificadas para ejecutar localmente.
