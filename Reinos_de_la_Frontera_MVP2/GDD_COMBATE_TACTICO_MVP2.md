# Game Design Document — Combate táctico MVP 2

**Estado:** diseño inicial sujeto a balance y playtesting. Esta sección no altera fórmulas del MVP 1 hasta que el sistema acuerde un adaptador de estadísticas versionado.

## 1. Fantasía jugable

Diriges **formaciones** medievales, no héroes. El atacante aprovecha terreno, asedio y maniobras; el defensor protege posiciones y abastecimiento. El éxito proviene de la combinación de ejército reclutado en ciudades del mundo persistente, civilización, doctrina y decisiones tácticas breves.

Una derrota táctica importa si la partida era PvP real, pero el modo no es obligatorio para defenderse: ambos deben aceptar o se resuelve por combate AUTO heredado del MVP 1.

## 2. Diseño de encuentros

- **Entrenamiento (`TRAINING`):** dos jugadores o jugador contra doctrina NPC simple. No consume ni entrega recursos, tropas, medallas ni posiciones de ranking.
- **Táctico real (`WORLD_PVP`):** solo conflictos 1v1 elegibles, consentimiento bilateral, reserva de tropas y resultado canónico.
- **Automático (`AUTO`):** siempre disponible y por defecto, especialmente ausencias, fallos, Maravillas, grandes alianzas y NPC.

No hay lobby abierto con beneficios persistentes por ganar entrenamiento. La misma cuenta puede entrenar sin entrar a un mundo de temporada, según diseño de permisos.

## 3. Sistemas iniciales de unidades

| Arquetipo | Rol primario | Ventaja | Debilidad |
|---|---|---|---|
| Infantería con escudo | Mantener línea y proteger arqueros | Defensa frontal | Flanqueo y desgaste |
| Arqueros | Daño a distancia sobre formaciones visibles | Alcance y posición alta | Caballería cercana |
| Caballería | Reconocimiento, flanqueo, persecución | Movilidad | Lanzas, terreno estrecho |
| Asedio ligero | Puertas y posiciones fortificadas | Daño a estructuras | Lento y vulnerable |
| Sacerdote de campaña | Soporte de moral o atención a heridos posterior | Resiliencia colectiva | Baja capacidad de combate |

**Sin héroes** ni inventarios individuales. La identidad proviene de formaciones, edificios únicos y bonificaciones preexistentes de civilización.

## 4. Parámetros de simulación

Cada formación posee: `formationId`, `side`, `unitType`, `unitCount`, `hpTotal`, `morale`, `fatigue`, `positionXZ`, `facing`, `formationPreset`, `order`, `target`, `visibility`, `cooldowns` y `rulesetVersion`.

Los 3D soldados representados pueden ser instancias visuales; su número es una **representación** escalada del `unitCount` real, sin crear equivalencia soldado visual = proceso de IA independiente.

### Comandos P0

| Orden | Efecto | Reglas server-side |
|---|---|---|
| `MOVE` | Mover formación a posición navegable | Terreno, camino, velocidad, no atraviesa agua |
| `ATTACK` | Buscar/atacar formación objetivo | Visibilidad, facción enemiga, alcance y cooldown |
| `HOLD` | Defender posición | No persigue indefinidamente |
| `RETREAT` | Intentar retirarse | Zona de escape y penalización preestablecida |
| `SET_FORMATION` | Cambiar línea/cuña/escarmuza | Tiempo de reorganización, solo modo permitido |
| `SUPPORT` | Activar doctrina de apoyo si existe | Reglas de civilización, recurso/tiempo/cooldown |

**No hay poderes mágicos.** `SUPPORT` representa cura logísticamente limitada tras batalla, moral, orientación doctrinal o protección de retirada, según catálogo.

### Orden de procesamiento por tick

1. Leer comandos válidos hasta `inputDeadline`, ordenarlos por `playerId`, `seq` y criterio de desempate estable.
2. Validar fase/rol/objetivo/cooldown; rechazar comando imposible y registrar motivo.
3. Aplicar cambios de intención y rutas precalculadas de formación.
4. Avanzar centros de formación y resolver bloqueos relevantes en 2.5D.
5. Resolver alcance/ataques/impactos con PRNG sembrado y estadísticas versionadas.
6. Actualizar moral, retirada, captura de objetivo y tiempo restante.
7. Construir eventos y snapshot de estado visible por destinatario.
8. Verificar condiciones de fin y cerrar en `RESULT_PENDING`.

El cliente interpola entre estados confirmados y dibuja efectos visuales sin decidir daños.

## 5. Formaciones

**Línea:** bonificación frontal moderada, maniobrabilidad menor al girar.  
**Cuña:** embestida de caballería, vulnerable si queda inmovilizada.  
**Escaramuza:** distancia entre unidades visuales, apta para arqueros móviles con menor cobertura.

Las bonificaciones exactas se parametrizan tras realizar miles de simulaciones de balance. No se fijan porcentajes arbitrarios como verdad final en el PRD.

## 6. Terreno y obstáculos

### Llanura

Tres zonas de altura suave, bosque en bordes y dos posiciones de inicio equilibradas. Clima/bioma depende del mundo, pero no se calcula hidrodinámica ni clima físico complejo.

### Paso montañoso

Cuello de botella, rutas alternativas limitadas, altos útiles para arqueros y penalización controlada para caballería fuera de camino.

### Defensa fortificada

Puerta, muros, puntos de cobertura, campo de ataque externo y posiciones defensivas derivadas del snapshot del mundo. Destrucción calculada en motor, mallas 3D intercambiadas por estados visuales.

**Mapa navegable** precalculado; validar que el atacante siempre tiene al menos una ruta o una condición de resolución que no bloquee la partida.

## 7. Condiciones de cierre

- Se elimina toda formación con capacidad combativa de un bando.
- Se cumple objetivo militar predefinido de la batalla, no inventado por cliente.
- Termina el máximo de ticks: aplicar condición de victoria/desempate explícita en `rulesetVersion`, no `Math.random()` sin semilla.
- El motor emite `BattleCanonicalResult` con muertos, heridos, supervivientes, botín y daños derivados de reglas congeladas.

El límite de 5 minutos aplica al combate, excluyendo invitación y conciliación. Una sala no puede seguir indefinidamente si uno cierra el navegador.

## 8. Equilibrio automático vs táctico

Para cada plantilla de ejército `A` y defensa `B`, comparar 1.000 simulaciones AUTO y 1.000 tácticas con doctrinas de referencia. Medir:
- Distribución de pérdidas por bando.
- Dispersión según diferencia de fuerza y civilización.
- Frecuencia de retiradas exitosas, asedios y heridos recuperables.
- Posibles exploits (arrastrar formación por borde, spam, kite infinito, abusar timeout).
- Ventajas injustificadas de civilizaciones/sacerdotes en el nuevo motor.

Antes de habilitar `WORLD_PVP` se define margen de balance aceptado y lo documenta una ADR o acta de playtest; no inventarlo de antemano.

## 9. Integración con juego persistente

La fuente de soldados, tecnología y terreno es la instantánea del evento de llegada. Ni el RTS ni su cliente generan recursos nuevos. Al confirmar, el backend calcula recuperación de heridos mediante hospital/templos y aplica bajas/saqueos en una única transacción. Los rankings ofensivo/defensivo semanal reciben el mismo evento canónico que el combate AUTO.

**Grandes batallas de Maravilla nivel 100** no pueden forzarse a táctico en MVP2: el sistema AUTO y el cierre de temporada siguen funcionando sin servidor en vivo.

## 10. Narración visual y audio

Dirección de cámara isométrica al estilo RTS, animaciones cortas reutilizables, insignias de civilizaciones originales, sombras en cascada/ajustes de calidad según capacidad, ambiente sonoro coherente. Minimapa y paneles ligeros; interfaz clara para ver orden, objetivo, alcance, amenaza y daño recibido.

Los eventos visuales nunca deben sugerir una victoria si el resultado autoritativo aún no fue confirmado. Mostrar `Resultado pendiente de confirmar` cuando exista fallo temporal de commit.

## 11. Futuro: guerra naval RTS (NO MVP2 P0)

Experimento separado sobre barcos con flotabilidad **visual**, velocidad/viraje por clase, rutas sobre agua y colisión táctica simplificada. Reutilizar `battle-server` y contratos, pero **no modificar** navegación asíncrona del mundo ni introducir océanos simulados continuamente. Publicar solo tras medir una sala con flotas y verificar fallback.
