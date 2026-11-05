# Sistema de diseño de la interfaz

**Estado:** F1.4 iniciada · **Fuente de verdad:** [`apps/web/src/ui/tokens.css`](../../apps/web/src/ui/tokens.css) · **Dirección:** [Art Bible §11](../art/ART_BIBLE.md)

## Principios

1. **El escenario 3D manda.** La interfaz es contextual: paneles que aparecen cuando hay algo que hacer y se pliegan cuando no.
2. **Una sola fuente de estilo.** Ningún componente usa colores, tamaños ni duraciones literales: solo tokens.
3. **Conectada a funciones reales.** No hay pantallas ni controles decorativos; cada control llama a una acción del servidor o cambia un ajuste real del cliente.
4. **Accesible por defecto.** Foco visible en todo control, contraste AA, etiquetas accesibles, teclado completo y `prefers-reduced-motion` respetado.
5. **Nunca bloquear el juego por una animación.** Las acciones se envían al instante; la animación acompaña, no espera.

## Tokens

| Grupo | Tokens | Notas |
|---|---|---|
| Superficies | `--color-bg`, `--color-surface-1…3`, `--color-overlay`, `--color-border(-strong)` | Nogal/antracita cálidos |
| Texto | `--color-text`, `--color-text-muted`, `--color-text-faint`, `--color-text-on-accent` | Pergamino; `muted` sobre `surface-1` ≥ 4,5:1 |
| Acento y estados | `--color-accent(-strong, -deep)`, `--color-success`, `--color-warning`, `--color-danger`, `--color-info`, `--color-focus` | Dorado para acciones primarias |
| Civilizaciones | `--color-civ-crown(-trim)`, `--color-civ-league(-trim)` | Iguales a la Art Bible §5 |
| Tipografía | `--font-display` (Cinzel), `--font-body` (Inter Variable), `--font-mono`; escala `--text-xs…2xl`; pesos | Fuentes OFL autoalojadas (`@fontsource`), sin llamadas a terceros; cifras tabulares por defecto |
| Espaciado | `--space-1…7` (escala de 4 px) | |
| Forma | `--radius-sm/md/lg/pill`, `--border-width` | |
| Elevación | `--shadow-1…3`, `--shadow-inset`, `--z-scene/hud/panel/overlay/toast` | |
| Movimiento | `--ease-out`, `--ease-in-out`, `--duration-fast/base/slow` | A 0 ms con `prefers-reduced-motion: reduce` |

Las variables antiguas (`--panel`, `--gold`…) siguen existiendo como **alias** de los tokens para migrar pantalla a pantalla sin romper nada.

## Implementado (F1.4, primera entrega)

- Tokens centralizados y fuentes autoalojadas (Cinzel 600/700, Inter Variable).
- Foco visible en botones, enlaces, campos, selectores, pestañas y elementos con `tabindex`.
- Transiciones de *hover* y pulsación en botones, desactivadas con movimiento reducido.
- Selector real de **calidad gráfica** (Baja/Media/Alta) en la barra superior de la ciudad: cambia resolución interna, sombras, LOD y postproceso.
- Utilidad `.sr-only` para etiquetas solo para lectores de pantalla.

## Pendiente (criterios de aceptación de F1.4)

| Pieza | Criterio |
|---|---|
| Componentes React: `Panel`, `Button`, `Tabs`, `Tooltip`, `Badge`, `Meter`, `Toast`, `Modal`, `Icon` | Usados por todas las pantallas existentes; sin estilos duplicados en `styles.css` |
| Iconos SVG propios (rejilla 24, trazo 1,75) | Sustituyen los 9 emojis actuales (`⚔ 🛡 👥 ⏱`…) |
| Animaciones de apertura/cierre de paneles, selección, carga y confirmación | Prueba Playwright con `reducedMotion: 'reduce'` sin animaciones |
| Paneles contextuales plegables | A 1366×768 el escenario ocupa ≥ 75 % del ancho con el panel plegado |
| Contraste | Verificación automática AA de pares texto/fondo de los tokens |
