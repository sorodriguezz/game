"""Escritura de imágenes con el módulo de Blender (sin dependencias extra)."""

from __future__ import annotations

import os

import bpy
import numpy as np


def save(path: str, rgb: np.ndarray, *, fmt: str | None = None, quality: int = 90, linear: bool = False) -> str:
    """Guarda un array float (H, W, 3|4) en [0,1]. `linear=True` para datos (normal/ORM)."""
    h, w = rgb.shape[:2]
    if rgb.shape[2] == 3:
        rgb = np.concatenate([rgb, np.ones((h, w, 1))], axis=-1)
    fmt = fmt or {'.png': 'PNG', '.jpg': 'JPEG', '.webp': 'WEBP'}[os.path.splitext(path)[1].lower()]
    name = f'_io_{os.path.basename(path)}'
    # Imagen de 8 bits: los valores se escriben tal cual (sin gestión de color de la escena).
    # `save_render` aplicaría la transformación de vista (AgX) y desaturaría las texturas.
    img = bpy.data.images.new(name, width=w, height=h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.ascontiguousarray(np.clip(rgb[::-1], 0, 1), dtype=np.float32).ravel())
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    img.filepath_raw = os.path.abspath(path)
    img.file_format = fmt
    try:
        img.save(quality=quality)
    except TypeError:
        img.save()
    bpy.data.images.remove(img)
    return path


def contact_sheet(tiles: list[np.ndarray], cols: int, repeat: int = 2) -> np.ndarray:
    """Hoja de contacto: cada textura repetida `repeat`×`repeat` para revisar costuras."""
    rows = []
    for i in range(0, len(tiles), cols):
        row = [np.tile(t[..., :3], (repeat, repeat, 1)) for t in tiles[i : i + cols]]
        while len(row) < cols:
            row.append(np.zeros_like(row[0]))
        rows.append(np.concatenate(row, axis=1))
    return np.concatenate(rows, axis=0)
