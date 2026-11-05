"""Build original common-fallback terrestrial buildings through the existing pipeline.

Usage: python build_terrestrial.py --output <build-dir> --reports <report-dir>
Optional: --preview <preview-dir>, --types grain_mill,castle --stages 1,2,3
Publishing uses packages/asset-pipeline/src/publish.ts with these build reports.
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

from assets.terrestrial import GENERATORS
from reinos_assets import arch as A
from reinos_assets import export as X


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--output', default=os.path.join(ROOT, 'assets', 'build'))
    p.add_argument('--reports', default=os.path.join(ROOT, 'assets', 'reports'))
    p.add_argument('--preview')
    p.add_argument('--types', default=','.join(GENERATORS))
    p.add_argument('--stages', default='1,2,3')
    args = p.parse_args()
    for kind in args.types.split(','):
        for stage in map(int, args.stages.split(',')):
            X.reset_scene()
            asset_id = f'{kind}.common.s{stage}'
            t0 = time.time()
            lods = X.build_lods(GENERATORS[kind](A.CORONA, stage), asset_id, seed=zlib.crc32(asset_id.encode()) & 0xFFFF, lod_ratios=(.48, .18))
            for obj in lods:
                # Decimation may leave unused edges; validate before glTF export.
                obj.data.validate(clean_customdata=False)
                obj.data.update()
            problems = X._check_geometry(lods[0])
            size = X.export_glb(os.path.join(args.output, f'{asset_id}.glb'))
            dims = lods[0].dimensions
            report = {
                'assetId': asset_id, 'kind': 'building', 'type': kind,
                'visualStage': stage, 'triangles': [X.tris(o) for o in lods],
                'materials': [s.material.name for s in lods[0].material_slots if s.material],
                'dimensionsMeters': [round(dims.x, 2), round(dims.z, 2), round(dims.y, 2)],
                'bytes': size, 'problems': problems,
                'generator': f'tools/asset-gen/assets/terrestrial.py::{kind}',
                'seconds': round(time.time() - t0, 2),
            }
            if args.preview:
                report['previews'] = X.preview(os.path.join(args.preview, asset_id), os.path.join(ROOT, 'apps', 'web', 'public', 'assets', 'materials'), lods[0], views=('iso',), size=(480, 420))
            X.write_report(os.path.join(args.reports, f'{asset_id}.json'), report)
            print(f'{asset_id}: tris={report["triangles"]}, dims={report["dimensionsMeters"]}, problems={problems}', flush=True)


if __name__ == '__main__':
    main()
