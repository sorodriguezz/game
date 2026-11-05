"""Extrae HDRI CC0 de `@pmndrs/assets` (Poly Haven, 512 px, EXR) y los publica como Radiance .hdr.

Uso: python env.py <ruta a pmndrs-assets-1.7.0.tgz> [nombres...]
Procedencia: npm @pmndrs/assets@1.7.0 (licencia CC0-1.0), HDRI originales de Poly Haven (CC0).
"""

import base64
import os
import sys
import tarfile
import tempfile

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'apps', 'web', 'public', 'assets', 'env'))


def main() -> None:
    tgz = sys.argv[1]
    names = sys.argv[2:] or ['park', 'sky']
    os.makedirs(OUT, exist_ok=True)
    with tarfile.open(tgz) as tar, tempfile.TemporaryDirectory() as tmp:
        for name in names:
            member = tar.getmember(f'package/hdri/{name}.exr.js')
            text = tar.extractfile(member).read().decode('ascii')
            data = base64.b64decode(text.split('base64,', 1)[1].rstrip("';\n "))
            exr = os.path.join(tmp, f'{name}.exr')
            with open(exr, 'wb') as fh:
                fh.write(data)
            img = bpy.data.images.load(exr)
            scene = bpy.context.scene
            scene.render.image_settings.file_format = 'HDR'
            dst = os.path.join(OUT, f'{name}.hdr')
            img.save_render(dst, scene=scene)
            print(name, img.size[:], os.path.getsize(dst), 'B →', dst)


if __name__ == '__main__':
    main()
