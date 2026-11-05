"""CLI del pipeline de assets (Especificación → Generación → Corrección → LOD → Exportación → Validación → Previsualización).

Uso (con el entorno de herramientas, ver tools/asset-gen/README.md):
  python build.py textures [--size 1024] [--only corona.stone,...]
  python build.py building <tipo> [--civ imperial_crown|sea_league|all] [--stage 1|2|3|all] [--preview]
  python build.py all [--preview]
Salidas:
  apps/web/public/assets/materials/…           texturas publicadas + library.json
  assets/build/<id>.glb                         GLB exportado (sin optimizar)
  assets/reports/<id>.json                      triángulos por LOD, validación geométrica
  assets/previews/<id>_{iso,front}.png          render Cycles con materiales reales
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

from reinos_assets import arch  # noqa: E402
from reinos_assets import export as X  # noqa: E402
from reinos_assets import materials as M  # noqa: E402

PUBLIC = os.path.join(ROOT, 'apps', 'web', 'public', 'assets')
TEX_DIR = os.path.join(PUBLIC, 'materials')
BUILD_DIR = os.path.join(ROOT, 'assets', 'build')
REPORT_DIR = os.path.join(ROOT, 'assets', 'reports')
PREVIEW_DIR = os.path.join(ROOT, 'assets', 'previews')
CIVS = {'imperial_crown': 'corona', 'sea_league': 'liga'}
# piezas que bajan del suelo a propósito (pilotes del puerto bajo el agua)
BELOW_GROUND_OK = {'port', 'quarry', 'mine', 'palisade'}


def cmd_textures(args) -> None:
    only = args.only.split(',') if args.only else None
    t0 = time.time()
    idx = M.publish_textures(TEX_DIR, size=args.size, only=only)
    print(f'texturas: {len(idx)} materiales en {time.time() - t0:.1f} s → {TEX_DIR}')


def build_building(kind: str, civ: str, stage: int, preview: bool) -> dict:
    from assets.buildings import GENERATORS
    from assets.walls import WALL_PIECES

    GENERATORS = {**GENERATORS, **WALL_PIECES}

    X.reset_scene()
    st = arch.STYLES[civ]
    asset_id = f'{kind}.{CIVS[civ]}.s{stage}'
    t0 = time.time()
    builder = GENERATORS[kind](st, stage)
    lods = X.build_lods(builder, asset_id, seed=zlib.crc32(asset_id.encode()) & 0xFFFF, recenter=kind not in BELOW_GROUND_OK - {'quarry', 'mine'})
    problems = X._check_geometry(lods[0], below_ground_ok=kind in BELOW_GROUND_OK)
    glb = os.path.join(BUILD_DIR, f'{asset_id}.glb')
    size = X.export_glb(glb)
    dims = lods[0].dimensions
    report = {
        'assetId': asset_id,
        'kind': 'building',
        'type': kind,
        'civilization': civ,
        'visualStage': stage,
        'triangles': [X.tris(o) for o in lods],
        'materials': [s.material.name for s in lods[0].material_slots if s.material],
        'dimensionsMeters': [round(dims.x, 2), round(dims.z, 2), round(dims.y, 2)],
        'bytes': size,
        'problems': problems,
        'generator': f'tools/asset-gen/assets/buildings.py::{kind}',
        'seconds': round(time.time() - t0, 2),
    }
    if preview:
        report['previews'] = [os.path.relpath(p, ROOT) for p in X.preview(os.path.join(PREVIEW_DIR, asset_id), TEX_DIR, lods[0])]
    X.write_report(os.path.join(REPORT_DIR, f'{asset_id}.json'), report)
    tag = 'OK ' if not problems else 'WARN'
    print(f'[{tag}] {asset_id}: tris {report["triangles"]}, {report["dimensionsMeters"]} m, {size} B, mats {report["materials"]}')
    for p in problems:
        print(f'      - {p}')
    return report


def cmd_building(args) -> None:
    civs = list(CIVS) if args.civ == 'all' else [args.civ]
    stages = [1, 2, 3] if args.stage == 'all' else [int(args.stage)]
    for civ in civs:
        for stage in stages:
            build_building(args.kind, civ, stage, args.preview)


def build_nature(kind: str, variant: int, preview: bool) -> dict:
    from assets.nature import NATURE

    X.reset_scene()
    asset_id = f'{kind}.v{variant}'
    t0 = time.time()
    builder = NATURE[kind][0](variant)
    lods = X.build_lods(builder, asset_id, seed=zlib.crc32(asset_id.encode()) & 0xFFFF, lod_ratios=(0.5, 0.2), recenter=True)
    problems = X._check_geometry(lods[0], below_ground_ok=True)
    size = X.export_glb(os.path.join(BUILD_DIR, f'{asset_id}.glb'))
    dims = lods[0].dimensions
    report = {
        'assetId': asset_id,
        'kind': 'prop',
        'type': kind,
        'variant': variant,
        'triangles': [X.tris(o) for o in lods],
        'materials': [s.material.name for s in lods[0].material_slots if s.material],
        'dimensionsMeters': [round(dims.x, 2), round(dims.z, 2), round(dims.y, 2)],
        'bytes': size,
        'problems': problems,
        'generator': f'tools/asset-gen/assets/nature.py::{kind}',
        'seconds': round(time.time() - t0, 2),
    }
    if preview:
        report['previews'] = [os.path.relpath(p, ROOT) for p in X.preview(os.path.join(PREVIEW_DIR, asset_id), TEX_DIR, lods[0], views=('front',))]
    X.write_report(os.path.join(REPORT_DIR, f'{asset_id}.json'), report)
    print(f'[{"OK " if not problems else "WARN"}] {asset_id}: tris {report["triangles"]}, {report["dimensionsMeters"]} m, {size} B')
    for p in problems:
        print(f'      - {p}')
    return report


def cmd_nature(args) -> None:
    from assets.nature import NATURE

    kinds = list(NATURE) if args.kind == 'all' else [args.kind]
    for kind in kinds:
        for v in range(NATURE[kind][1]):
            build_nature(kind, v, args.preview)


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    t = sub.add_parser('textures')
    t.add_argument('--size', type=int, default=M.TEXTURE_SIZE)
    t.add_argument('--only', default='')
    bld = sub.add_parser('building')
    bld.add_argument('kind')
    bld.add_argument('--civ', default='all')
    bld.add_argument('--stage', default='all')
    bld.add_argument('--preview', action='store_true')
    nat = sub.add_parser('nature')
    nat.add_argument('kind', nargs='?', default='all')
    nat.add_argument('--preview', action='store_true')
    a = p.parse_args()
    {'textures': cmd_textures, 'building': cmd_building, 'nature': cmd_nature}[a.cmd](a)


if __name__ == '__main__':
    main()
