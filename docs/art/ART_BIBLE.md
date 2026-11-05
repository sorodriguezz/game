# Art Bible — Reinos de la Frontera

**Versión:** `realistic-stylized-v1` (coincide con `styleVersion` de `apps/web/public/assets/manifest.json`)
**Estado:** vigente para producción de assets · las referencias visuales quedan **pendientes de aprobación humana** (§14).
**Regla:** un asset que incumple esta biblia no se aprueba, aunque el GLB sea válido. Se corrige, se reemplaza o se registra como pendiente con su versión temporal separada.

---

## 1. Dirección artística

**Realismo medieval estilizado** visto desde una cámara elevada (40–60° de inclinación).

| Sí | No |
|---|---|
| Proporciones reales (humanos 1,70–1,85 m, puertas 2,2 m, plantas de 3 m) | Cabezas grandes, manos enormes, proporciones de juguete |
| Siluetas legibles: tejados ~10 % más inclinados de lo real, estandartes y chimeneas que rompan el perfil | Volúmenes cúbicos sin detalle o primitivas sueltas como arte final |
| Materiales PBR con variación macro (manchas, humedad, desgaste en bordes) | Colores planos, plástico brillante, saturación alta |
| Biseles en aristas que capten la luz del sol | Aristas perfectas a 90° que desaparecen a distancia |
| Detalle concentrado en zonas visibles desde arriba (tejados, patios, cimeras) | Detalle en bajos y caras ocultas |
| Iluminación natural con sombras de contacto | Contornos, *cel shading*, luces de colores |

Identidad original: ningún asset copia edificios, unidades, iconos ni interfaces de juegos existentes. Las referencias son históricas (arquitectura europea de los siglos XII–XV), no de otros juegos.

## 2. Unidades, ejes y pivotes

- **1 unidad = 1 metro.** Eje **Y arriba**, frente del asset hacia **+Z** (convención glTF). Blender exporta con `+Y up`.
- **Pivote** en el centro de la base, a nivel del suelo (y = 0). Los barcos: pivote en la línea de flotación.
- Escala aplicada (transformaciones a 1), normales recalculadas hacia fuera, sin geometría suelta.
- Huella máxima por parcela (de `cityLayout`, separación mínima ≈ 15 m): **estándar ≤ 11 × 11 m**, **centro ≤ 18 × 18 m**, **costera ≤ 14 × 18 m** (el lado −Z es el agua).

## 3. Escalas arquitectónicas

| Elemento | Medida |
|---|---|
| Planta / altura de piso | 3,0 m (planta baja de piedra 3,4 m) |
| Puerta común / portón | 1,0 × 2,2 m / 3,2 × 4,2 m |
| Ventana | 0,7 × 1,1 m, alféizar a 1,0 m |
| Grosor de muro de piedra / entramado | 0,6 m / 0,3 m |
| Muralla (nivel 9) | 7 m de alto, 2,6 m de grosor, almenas 0,9 × 0,9 m |
| Torre | 10–13 m, 4,5–6 m de diámetro |
| Centro urbano etapa 3 | 16–19 m al caballete |
| Inclinación de tejado | teja 35–40°, pizarra/paja 45–55° |

**Etapas visuales** (`visualStage`: niveles 1–3 → 1, 4–7 → 2, 8+ → 3): cada etapa **amplía** el edificio (alas, segundo piso, torre, patio), no solo lo escala. Las Maravillas usan 5 etapas modulares de andamio → obra → núcleo → cúpula → coronación.

## 4. Proporciones de personajes

| Medida | Valor |
|---|---|
| Altura (milicia, lancero, arquero) | 1,76 m (≈ 7,5 cabezas) |
| Sacerdote | 1,72 m, túnica hasta el tobillo |
| Caballo (cruz) | 1,55 m; jinete sentado 2,4 m total |
| Lanza / pica | 2,8 m / 3,6 m |
| Arco largo | 1,7 m |
| Escudo | redondo 0,8 m o de cometa 1,0 m |

Esqueleto humanoide compartido (≤ 22 huesos) para todas las unidades a pie; variaciones por malla, no por animación (§8).

## 5. Paleta cromática

### Naturaleza (compartida)

| Uso | Color base | Rango |
|---|---|---|
| Hierba de verano | `#6E7F3E` | `#5C6E34`–`#8A9A4E` (variación macro obligatoria) |
| Tierra de camino | `#8B7255` | `#6F5A43`–`#A08866` |
| Grava / piedra natural | `#8F887C` | `#6E685F`–`#B2AA9C` |
| Arena de costa | `#CDB98A` | — |
| Agua somera / profunda | `#3E7C82` / `#1D4656` | gradiente por profundidad |
| Follaje | `#3F5E2A` | `#344F23`–`#5B7A36` |
| Cielo de horizonte (niebla) | `#BFD0DA` | — |

### Imperio de la Corona (`imperial_crown`) — reino continental

Mampostería caliza clara, planta baja de piedra y pisos de **entramado de roble oscuro con revoque ocre**, **teja de barro rojiza**, torres redondas con chapiteles. Estandarte carmesí con oro.

| Material | Color |
|---|---|
| Caliza | `#CFC3A6` |
| Teja | `#9A4B32` |
| Revoque | `#D9C9A3` |
| Roble | `#4A3524` |
| Carmesí / oro | `#8E1E22` / `#C9A24B` |

### Liga de los Mares (`sea_league`) — liga mercante marítima

**Encalado blanco**, **pizarra gris azulada** y **tablazón de pino curtido**, hastiales empinados, pilotes, cabos y grúas. Estandarte azul mar con hueso.

| Material | Color |
|---|---|
| Encalado | `#E6E0D2` |
| Pizarra | `#4C5A66` |
| Pino curtido | `#7A6248` |
| Azul mar / hueso | `#1F6F8B` / `#E8E2CF` |

Regla de color de equipo: el color de bando aparece en **estandartes, gualdrapas, túnicas y ribetes**, nunca en superficies grandes de arquitectura ni como discos de suelo opacos.

## 6. Materiales PBR

- Flujo **metalness/roughness** (glTF). Texturas: `baseColor` (sRGB), `normal`, `ORM` (oclusión, rugosidad, metal).
- **Hojas de recorte (*trim sheets*) por civilización** de 1024² compartidas por todos los edificios de esa civilización: sillería, revoque, madera, teja/pizarra, metal, tela. Un edificio usa 1–3 materiales.
- Rugosidad: piedra 0,85–0,95; madera 0,7–0,85; teja 0,6–0,75; metal forjado 0,35–0,5 (metalness 1); agua 0,05.
- Variación obligatoria: ningún material de superficie grande es un color uniforme; mínimo ruido macro (±8 % de luminancia) y desgaste de aristas.
- Prohibido `metalness` > 0 en piedra o madera; prohibido emisivo salvo fuego, ventanas nocturnas o efectos.

## 7. Terreno y vegetación

- Terreno con **elevación suave** (ruido sembrado, determinista), capas: hierba, hierba seca, tierra, roca, arena; caminos con borde difuso.
- Árboles: mínimo **3 especies** (roble/caducifolio, pino, abedul) × 3 tamaños, follaje en racimos con tarjetas alfa recortadas; tronco con raíces que entren en el suelo.
- Arbustos, rocas (3 variantes), hierba alta en bordes de camino y vallas.
- La vegetación decorativa **no altera** colisiones ni reglas militares; en la arena solo existe donde el escenario táctico la declara (bosque = obstáculo de simulación).

## 8. Personajes y animación

- Esqueleto humanoide compartido; animaciones compartidas: `idle`, `walk`, `run`, `attack_melee`, `attack_ranged`, `hit`, `death`, `retreat` (= `run` + postura), `cheer`, `pray` (sacerdote). Caballo: `idle`, `walk`, `gallop`.
- Variación visual por **malla y material** (casco, escudo, arma, túnica), no por clip.
- Lectura de bando por túnica/estandarte; lectura de tipo por silueta del arma (lanza larga, arco, escudo, báculo).
- Muertes y retiradas solo cuando el servidor confirma bajas o estado `ROUTED`; la animación nunca decide daño.

## 9. Agua y efectos ambientales

- Agua: dos capas de normales en desplazamiento, color por profundidad (somera → profunda), reflejo del entorno (IBL), espuma en la orilla. Sin simulación física de oleaje.
- Efectos permitidos: humo de chimenea, polvo al marchar, chispas de impacto, flechas visibles, brillo suave de apoyo del sacerdote. Partículas con presupuesto (§12).

## 10. Iluminación

- **Un sol** direccional (5200–5600 K, elevación 40–55°) con sombras; **IBL** con un HDRI de cielo CC0 como luz ambiental; **sin** luces de relleno direccionales adicionales cuando hay IBL.
- *Tone mapping* ACES/Neutral, exposición 1,0–1,2; niebla lineal del color del horizonte.
- Perfiles **Bajo/Medio/Alto** (§12) cambian resolución, sombras y efectos de verdad.

## 11. Interfaz e iconos

- Tipografías (OFL, autoalojadas vía `@fontsource`): **Cinzel** para títulos y nombres propios; **Inter** para HUD y texto; cifras con `font-variant-numeric: tabular-nums`.
- Iconos SVG propios: rejilla 24 px, trazo 1,75 px, uniones redondeadas, un color (hereda `currentColor`). **Sin emojis** en la interfaz final.
- Paneles oscuros de nogal/antracita con texto pergamino y acentos dorados; el escenario 3D tiene prioridad (paneles contextuales y plegables). Detalle en [`docs/visual-redesign/UI_DESIGN_SYSTEM.md`](../visual-redesign/UI_DESIGN_SYSTEM.md).

## 12. Presupuestos por categoría (LOD0 → LOD1 → LOD2)

| Categoría | Triángulos | Materiales | Texturas |
|---|---|---|---|
| Edificio mayor (centro, castillo, templo, puerto) | ≤ 20 k → 50 % → 15 % | ≤ 3 | *trim sheet* de civilización (1024²) |
| Edificio estándar | ≤ 10 k → 50 % → 15 % | ≤ 3 | *trim sheet* compartida |
| Tramo de muralla / torre | ≤ 4 k / ≤ 8 k | ≤ 2 | *trim sheet* |
| Prop (barril, carro, valla) | ≤ 1 k | 1 | atlas de props (1024²) |
| Árbol | ≤ 2,5 k | 2 (corteza, hojas alfa) | 512² |
| Soldado a pie | ≤ 3 k → 1,2 k → 400 | 1 | atlas de unidades (1024²) |
| Caballo | ≤ 3,5 k → 1,5 k → 500 | 1 | atlas de unidades |
| Barco | ≤ 12 k | ≤ 3 | 1024² |

Escena (perfil **Medio**): ciudad ≤ 250 llamadas de dibujo y ≤ 1,5 M triángulos; batalla de 500 soldados ≤ 150 llamadas (instancing/agrupación). Se validan con `apps/web/e2e/visual-benchmark.e2e.mjs`.

## 13. Niveles de zoom

| Cámara (distancia) | Ciudad | Batalla |
|---|---|---|
| Cerca (< 60 m) | LOD0, habitantes, humo, banderas animadas | soldados LOD0 animados a ritmo completo |
| Media (60–130 m) | LOD1, habitantes reducidos | LOD1, animación a ½ frecuencia |
| Lejos (> 130 m) | LOD2, sin habitantes | LOD2, estandarte + marca de formación |

## 14. Referencias visuales propias

Las únicas referencias válidas son **capturas del propio motor** guardadas en `docs/art/references/` con fecha y versión del asset. Estado actual: **pendientes** — se registrarán al cerrar los *vertical slices* de ciudad y batalla y requieren aprobación humana para pasar a `APPROVED`.

## 15. Licencias y procedencia

Todo asset declara licencia y procedencia en el manifiesto. Aceptadas: obra propia generada por los *scripts* del repositorio, CC0 con origen registrado (p. ej. HDRI de Poly Haven distribuidos en `@pmndrs/assets`), OFL para fuentes. Prohibido: assets extraídos de otros juegos, de procedencia desconocida, o generados por servicios cuyas condiciones no permitan uso comercial.
