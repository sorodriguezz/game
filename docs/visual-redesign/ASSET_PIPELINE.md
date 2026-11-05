# Pipeline de assets 3D

Especificación → Generación → Corrección → Materiales → (Rig/animación) → LOD → Optimización → Validación → Integración.
Todo es reproducible: los assets se regeneran desde *scripts* versionados con semillas fijas.

## Separación de recursos

| Ruta | Contenido | Git |
|---|---|---|
| `tools/asset-gen/` | Fuente: generadores Python (Blender `bpy`) por asset, kit arquitectónico, texturas procedurales | sí |
| `assets/build/*.glb` | Exportación original de Blender (sin optimizar) | no (`.gitignore`) |
| `assets/reports/*.json` | Informe por asset: triángulos por LOD, materiales, dimensiones, problemas, generador | sí |
| `assets/previews/*.png` | Renders Cycles con materiales reales (revisión) | no; los de referencia se copian a `docs/art/references/` |
| `apps/web/public/assets/models/*.glb` | Publicados: optimizados, validados | sí |
| `apps/web/public/assets/materials/` | Biblioteca de materiales compartidos (WebP) + `library.json` | sí |
| `apps/web/public/assets/env/*.hdr` | HDRI CC0 para IBL | sí |
| `apps/web/public/assets/manifest.json` | Manifiesto central: estado, versión, procedencia, validaciones | sí |

## Comandos

Entorno de herramientas (una vez): Python 3.13 + Blender como módulo.

```bash
uv venv ~/.venvs/blender --python 3.13
```

```bash
VIRTUAL_ENV=~/.venvs/blender uv pip install -r tools/asset-gen/requirements.txt
```

Generar texturas, edificios, muralla y vegetación:

```bash
cd tools/asset-gen && ~/.venvs/blender/bin/python build.py textures
```

```bash
cd tools/asset-gen && ~/.venvs/blender/bin/python build.py building barracks --civ all --stage all
```

(Se invoca por tipo: `city_hall farm sawmill quarry mine warehouse barracks hospital temple port imperial_bastion naval_arsenal wall_segment wall_tower wall_gate palisade`; añadir `--preview` para renders Cycles.)

```bash
cd tools/asset-gen && ~/.venvs/blender/bin/python build.py nature
```

Optimizar, validar y publicar (actualiza el manifiesto; nunca marca `APPROVED`):

```bash
pnpm --filter @reinos/asset-pipeline publish:assets
```

Validar el manifiesto (CI):

```bash
pnpm assets:validate
```

## Reglas del pipeline

1. **Unidades y ejes:** metros, Z arriba en Blender (Y arriba en glTF), frente −Y en Blender (+Z en glTF), pivote en el centro de la base. Edificios: la puerta mira a la plaza (`facing: plaza`); el puerto mira al mar (`facing: outward`).
2. **Materiales por nombre:** los GLB no incrustan texturas; cada malla referencia un material de la biblioteca (`corona.stone`, `liga.roof`, `common.iron`…) y el cliente lo sustituye por la instancia compartida (`apps/web/src/assets/runtime.ts`). Cada textura se descarga una vez.
3. **UV en metros:** el material repite cada `tileMeters`; por eso la cuantización no toca `TEXCOORD_0` y `prune` conserva atributos.
4. **Color de vértice `COLOR_0`:** oclusión de contacto con el suelo × variación por pieza (calculado, no pintado). El material lo multiplica.
5. **LOD:** nodos `LOD0`/`LOD1`/`LOD2` en el mismo GLB; LOD1/2 sin piezas marcadas como detalle y decimados. El cliente cambia por distancia según el perfil gráfico.
6. **Semillas:** `zlib.crc32(assetId)`, nunca `hash()` de Python (aleatorio por proceso).

## Validación automática

| Comprobación | Dónde |
|---|---|
| Base en el suelo; piezas flotantes sin contacto; caras degeneradas | `tools/asset-gen/reinos_assets/export.py` |
| Triángulos (LOD0) y materiales dentro del presupuesto; LOD decreciente | `packages/asset-pipeline/src/inspect.ts` |
| `NORMAL`, `TEXCOORD_0`, `COLOR_0` presentes | idem |
| Materiales existen en la biblioteca y coinciden con los exportados (detectó que `dedup` fusionaba materiales) | `packages/asset-pipeline/src/publish.ts` |
| Escala plausible, pivote centrado (salvo `belowGroundOk`) | `inspect.ts` |
| Revisión visual | renders Cycles (`--preview`) + capturas en el motor; aprobación humana en el manifiesto |

## Defectos que el pipeline ya detectó y corrigió

- Texturas desaturadas: `save_render` aplicaba la transformación de vista AgX → se escriben bytes sin gestión de color.
- UV eliminadas por `prune()` al no haber texturas en el GLB → `keepAttributes: true`.
- Todos los materiales fusionados por `dedup()` → se excluyen materiales.
- Rocas flotando 0,3 m → el apoyo es la cota mínima.
- Semillas no deterministas por `hash()` → CRC32.

## Pendiente

- Draco (requiere servir el decodificador de navegador); grupos de suavizado para reducir vértices duplicados.
- Rig, animaciones compartidas y colisiones simplificadas (F1.1 soldado, F3.1).
- Captura automática en motor por asset y comparación de píxeles (F1.6).
