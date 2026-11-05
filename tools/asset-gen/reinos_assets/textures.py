"""Texturas PBR procedurales y repetibles sin costuras (numpy).

Todo ruido se genera filtrando ruido blanco en el dominio de la frecuencia, de
modo que es periódico por construcción: la textura repite sin costura en U y V.
Las semillas son explícitas; el mismo `seed` produce los mismos píxeles.
Salida: baseColor (sRGB), normal (OpenGL/glTF, +Y), ORM (R=oclusión, G=rugosidad, B=metal).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

Array = np.ndarray


def _rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def fractal_noise(size: int, seed: int, beta: float = 2.0, low_cut: float = 1.0) -> Array:
    """Ruido 1/f^beta periódico normalizado a [0, 1]."""
    rng = _rng(seed)
    white = rng.standard_normal((size, size))
    fy = np.fft.fftfreq(size)[:, None] * size
    fx = np.fft.rfftfreq(size)[None, :] * size
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    spectrum = 1.0 / np.power(np.maximum(f, low_cut), beta / 2.0)
    spectrum[0, 0] = 0.0
    out = np.fft.irfft2(np.fft.rfft2(white) * spectrum, s=(size, size))
    out -= out.min()
    return out / max(out.max(), 1e-9)


def blur_periodic(a: Array, radius: float) -> Array:
    """Desenfoque gaussiano periódico (por FFT)."""
    n = a.shape[0]
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.rfftfreq(n)[None, :]
    g = np.exp(-2 * (np.pi * radius) ** 2 * (fx * fx + fy * fy))
    return np.fft.irfft2(np.fft.rfft2(a) * g, s=a.shape)


def normal_from_height(h: Array, strength: float) -> Array:
    """Mapa de normales (convención glTF/OpenGL) desde altura periódica."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    nx = -dx * strength
    ny = dy * strength  # filas crecen hacia abajo en la imagen; V crece hacia arriba
    nz = np.ones_like(h)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx * inv, ny * inv, nz * inv], axis=-1) * 0.5 + 0.5


def cavity_ao(h: Array, radius: float = 6.0, strength: float = 1.6) -> Array:
    """Oclusión aproximada: zonas más bajas que su entorno se oscurecen."""
    local = blur_periodic(h, radius)
    ao = 1.0 - np.clip((local - h) * strength, 0.0, 1.0)
    return np.clip(ao, 0.0, 1.0)


def hex_rgb(hexstr: str) -> Array:
    hexstr = hexstr.lstrip('#')
    return np.array([int(hexstr[i : i + 2], 16) / 255.0 for i in (0, 2, 4)])


def srgb_to_linear(c: Array) -> Array:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def tint(base: str, variation: Array, amount: float, warm_shift: Array | None = None) -> Array:
    """Color base modulado en luminancia (en espacio lineal) por un campo [0,1]."""
    lin = srgb_to_linear(hex_rgb(base))[None, None, :]
    k = 1.0 + (variation[..., None] - 0.5) * 2.0 * amount
    col = lin * k
    if warm_shift is not None:
        col = col * (1.0 + (warm_shift[..., None] - 0.5) * np.array([0.10, 0.02, -0.08]))
    lin_out = np.clip(col, 0.0, 1.0)
    return np.where(lin_out <= 0.0031308, lin_out * 12.92, 1.055 * np.power(lin_out, 1 / 2.4) - 0.055)


@dataclass
class PbrSet:
    """Conjunto PBR en float [0,1], forma (N, N, 3)."""

    base: Array
    normal: Array
    orm: Array


def _orm(ao: Array, rough: Array | float, metal: float = 0.0) -> Array:
    rough_a = np.broadcast_to(np.clip(rough, 0.03, 1.0), ao.shape)
    return np.stack([ao, rough_a, np.full_like(ao, metal)], axis=-1)


# ---------------------------------------------------------------- mampostería


def ashlar(size: int, seed: int, color: str, rows: int, mortar: str = '#8f8676', course_jitter: float = 0.35) -> PbrSet:
    """Sillería: hiladas de bloques de longitud variable, junta rehundida y aristas desgastadas."""
    rng = _rng(seed)
    h = np.zeros((size, size))
    block_id = np.zeros((size, size))
    row_h = size / rows
    gap = max(2, size // 160)
    yy, xx = np.mgrid[0:size, 0:size]
    for r in range(rows):
        y0 = int(round(r * row_h))
        y_end = int(round((r + 1) * row_h))
        x = int(rng.integers(0, size // 4))
        widths = []
        total = 0
        while total < size:
            w = int(row_h * rng.uniform(1.3, 2.6))
            widths.append(w)
            total += w
        scale = size / total
        x = int(x)
        for i, w in enumerate(widths):
            w = int(round(w * scale))
            x0 = x
            x1 = x + w
            rows_sl = slice(y0 + gap, y_end - gap)
            cols = np.arange(x0 + gap, x1 - gap) % size
            if len(cols) == 0:
                x = x1
                continue
            bump = 0.75 + rng.uniform(-0.12, 0.12) * course_jitter
            h[rows_sl, cols] = bump
            block_id[rows_sl, cols] = rng.uniform()
            x = x1
    # aristas redondeadas + picado de superficie
    edge = blur_periodic(h, size / 512 * 2.5)
    detail = fractal_noise(size, seed + 1, beta=1.6)
    chips = (fractal_noise(size, seed + 2, beta=2.4) > 0.72).astype(float) * 0.18
    height = np.clip(edge * (0.9 + detail * 0.1) - chips * (h > 0), 0, 1)
    macro = fractal_noise(size, seed + 3, beta=2.6)
    stains = np.clip((fractal_noise(size, seed + 4, beta=2.9) - 0.55) * 2.2, 0, 1)
    var = np.clip(0.55 * block_id + 0.3 * macro + 0.15 * detail, 0, 1)
    stone = tint(color, var, 0.28, warm_shift=macro) * (1 - 0.22 * stains[..., None])
    mortar_col = tint(mortar, detail, 0.1)
    is_stone = np.clip((h > 0).astype(float), 0, 1)[..., None]
    base = stone * is_stone + mortar_col * (1 - is_stone)
    ao = cavity_ao(height, radius=size / 256 * 3) * (0.82 + 0.18 * is_stone[..., 0])
    rough = 0.86 + 0.08 * (1 - detail) - 0.04 * is_stone[..., 0]
    return PbrSet(base * ao[..., None] ** 0.35, normal_from_height(height, size / 512 * 9.0), _orm(ao, rough))


def plaster(size: int, seed: int, color: str) -> PbrSet:
    """Revoque/encalado: ondulación de llana, manchas suaves y fisuras finas."""
    macro = fractal_noise(size, seed, beta=2.8)
    trowel = fractal_noise(size, seed + 1, beta=2.2)
    fine = fractal_noise(size, seed + 2, beta=1.2)
    cracks_src = fractal_noise(size, seed + 3, beta=2.0)
    cracks = np.clip(1.0 - np.abs(cracks_src - 0.5) * 90.0, 0, 1) * (fractal_noise(size, seed + 4, beta=2.6) > 0.62)
    height = 0.5 + 0.25 * trowel + 0.08 * fine - 0.25 * cracks
    var = np.clip(0.6 * macro + 0.25 * trowel + 0.15 * fine, 0, 1)
    stains = np.clip((fractal_noise(size, seed + 5, beta=3.0) - 0.5) * 1.8, 0, 1)
    base = tint(color, var, 0.2, warm_shift=macro) * (1 - 0.35 * cracks[..., None]) * (1 - 0.14 * stains[..., None])
    ao = cavity_ao(height, radius=size / 256 * 2, strength=1.2)
    rough = 0.88 + 0.08 * fine
    return PbrSet(base, normal_from_height(height, size / 512 * 3.0), _orm(ao, rough))


# --------------------------------------------------------------------- madera


def wood(size: int, seed: int, color: str, planks: int = 4, plank_seams: bool = True) -> PbrSet:
    """Madera con veta a lo largo de U (eje X de la imagen) y tablas opcionales."""
    rng = _rng(seed)
    yy, xx = np.mgrid[0:size, 0:size] / size
    warp = fractal_noise(size, seed, beta=2.4)
    grain_coord = yy * planks * 6 + warp * 2.2
    grain = 0.5 + 0.5 * np.sin(grain_coord * np.pi * 2 * 3.0)
    fine = fractal_noise(size, seed + 1, beta=1.0)
    plank_idx = np.floor(yy * planks).astype(int)
    plank_tone = rng.uniform(0, 1, planks + 1)[plank_idx]
    seams = np.zeros((size, size))
    if plank_seams:
        frac = (yy * planks) % 1.0
        seams = np.clip(1 - np.minimum(frac, 1 - frac) * size / planks / 2.5, 0, 1)
        # juntas a tope desplazadas por tabla
        offs = rng.uniform(0, 1, planks + 1)[plank_idx]
        bx = ((xx + offs) * 1.0) % 1.0
        seams = np.maximum(seams, np.clip(1 - np.minimum(bx, 1 - bx) * size / 2.0, 0, 1) * 0.9)
    knots = (fractal_noise(size, seed + 5, beta=3.0) > 0.86).astype(float)
    height = 0.55 + 0.18 * grain + 0.1 * fine - 0.5 * seams - 0.1 * knots
    var = np.clip(0.45 * plank_tone + 0.35 * grain + 0.2 * fine, 0, 1)
    base = tint(color, var, 0.22) * (1 - 0.45 * seams[..., None]) * (1 - 0.3 * knots[..., None])
    ao = cavity_ao(height, radius=size / 256 * 2)
    rough = 0.74 + 0.12 * fine + 0.1 * seams
    return PbrSet(base, normal_from_height(height, size / 512 * 5.0), _orm(ao, rough))


# --------------------------------------------------------------------- tejados


def roof_tiles(size: int, seed: int, color: str, rows: int = 8, cols: int = 10) -> PbrSet:
    """Teja curva solapada (V = pendiente, filas hacia abajo), con musgo ocasional."""
    rng = _rng(seed)
    yy, xx = np.mgrid[0:size, 0:size] / size
    row = np.floor(yy * rows)
    fy = (yy * rows) % 1.0
    shift = (row % 2) * 0.5
    fx = ((xx * cols + shift) % 1.0)
    col_idx = np.floor(xx * cols + shift).astype(int) % cols
    profile = np.sin(fx * np.pi) ** 0.7  # sección curva de la teja
    overlap = 1.0 - np.clip((fy - 0.78) / 0.22, 0, 1)  # el borde inferior cae sobre la fila siguiente
    height = profile * (0.55 + 0.45 * (1 - fy)) * overlap
    tile_tone = rng.uniform(0, 1, (rows + 1, cols + 1))[row.astype(int), col_idx]
    macro = fractal_noise(size, seed + 1, beta=2.6)
    fine = fractal_noise(size, seed + 2, beta=1.3)
    moss = np.clip((fractal_noise(size, seed + 3, beta=2.8) - 0.68) * 5, 0, 1) * (1 - profile)
    var = np.clip(0.5 * tile_tone + 0.3 * macro + 0.2 * fine, 0, 1)
    base = tint(color, var, 0.2, warm_shift=macro)
    base = base * (1 - moss[..., None]) + tint('#5b6431', fine, 0.2) * moss[..., None]
    gaps = (fx < 0.04) | (fx > 0.96)
    height = np.where(gaps, height * 0.3, height) + fine * 0.04
    ao = cavity_ao(height, radius=size / 256 * 3, strength=2.0)
    rough = 0.62 + 0.15 * fine + 0.2 * moss
    return PbrSet(base * ao[..., None] ** 0.5, normal_from_height(height, size / 512 * 8.0), _orm(ao, rough))


def slate(size: int, seed: int, color: str, rows: int = 10, cols: int = 7) -> PbrSet:
    """Pizarra en escamas rectangulares solapadas, tono frío con variación por pieza."""
    rng = _rng(seed)
    yy, xx = np.mgrid[0:size, 0:size] / size
    row = np.floor(yy * rows)
    fy = (yy * rows) % 1.0
    shift = (row % 2) * 0.5 + rng.uniform(-0.05, 0.05)
    fxx = xx * cols + shift
    fx = fxx % 1.0
    col_idx = np.floor(fxx).astype(int) % cols
    piece = rng.uniform(0, 1, (rows + 1, cols + 1))[row.astype(int), col_idx]
    edge_x = np.clip(np.minimum(fx, 1 - fx) * 40, 0, 1)
    lip = np.clip((1 - fy) * 6, 0, 1)
    fine = fractal_noise(size, seed + 1, beta=1.1)
    height = (0.4 + 0.6 * (1 - fy)) * edge_x * lip + fine * 0.05 + piece * 0.05
    var = np.clip(0.6 * piece + 0.4 * fine, 0, 1)
    base = tint(color, var, 0.18)
    ao = cavity_ao(height, radius=size / 256 * 2, strength=2.2)
    rough = 0.55 + 0.2 * fine
    return PbrSet(base * ao[..., None] ** 0.4, normal_from_height(height, size / 512 * 6.0), _orm(ao, rough))


def thatch(size: int, seed: int, color: str) -> PbrSet:
    """Paja: fibras largas en V (pendiente), capas escalonadas."""
    yy, xx = np.mgrid[0:size, 0:size] / size
    fibers = fractal_noise(size, seed, beta=1.0)
    stretch = blur_periodic(fibers, 0.6)
    # anisotropía: suavizado fuerte a lo largo de V
    n = size
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.rfftfreq(n)[None, :]
    g = np.exp(-2 * (np.pi * 9.0) ** 2 * (fy * fy)) * np.exp(-2 * (np.pi * 0.4) ** 2 * (fx * fx))
    strands = np.fft.irfft2(np.fft.rfft2(fibers - 0.5) * g, s=(n, n))
    strands = (strands - strands.min()) / max(np.ptp(strands), 1e-9)
    layers = (yy * 6) % 1.0
    height = 0.6 * strands + 0.4 * (1 - layers) + 0.05 * stretch
    macro = fractal_noise(size, seed + 1, beta=2.6)
    base = tint(color, np.clip(0.6 * strands + 0.4 * macro, 0, 1), 0.28, warm_shift=macro)
    ao = cavity_ao(height, radius=size / 256 * 2, strength=1.8)
    return PbrSet(base * ao[..., None] ** 0.5, normal_from_height(height, size / 512 * 7.0), _orm(ao, 0.9 + 0.05 * strands))


# ------------------------------------------------------------- terreno y otros


def ground(size: int, seed: int, kind: str) -> PbrSet:
    """Capas de terreno: grass, dry_grass, dirt, rock, sand, cobble."""
    macro = fractal_noise(size, seed, beta=2.7)
    mid = fractal_noise(size, seed + 1, beta=1.9)
    fine = fractal_noise(size, seed + 2, beta=0.9)
    if kind in ('grass', 'dry_grass'):
        blades = np.clip((fine - 0.35) * 1.8, 0, 1)
        clumps = np.clip((mid - 0.3) * 1.6, 0, 1)
        color = '#6E7F3E' if kind == 'grass' else '#8E8A4E'
        speck = fractal_noise(size, seed + 4, beta=0.4)
        base = tint(color, np.clip(0.3 * macro + 0.2 * clumps + 0.5 * speck, 0, 1), 0.3, warm_shift=macro)
        soil = tint('#6F5A43', fine, 0.2)
        bare = np.clip((0.12 - clumps) * 5, 0, 1)[..., None] * 0.45
        base = base * (1 - bare) + soil * bare
        height = 0.5 * clumps + 0.5 * blades
        rough = 0.9 + 0.06 * fine
        strength = 4.0
    elif kind == 'dirt':
        pebbles = np.clip((fractal_noise(size, seed + 3, beta=1.4) - 0.7) * 4, 0, 1)
        base = tint('#8B7255', np.clip(0.45 * macro + 0.35 * mid + 0.2 * fine, 0, 1), 0.34, warm_shift=mid)
        base = base * (1 - pebbles[..., None] * 0.5) + tint('#A89F90', fine, 0.15) * pebbles[..., None] * 0.5
        height = 0.6 * mid + 0.25 * fine + 0.4 * pebbles
        rough = 0.93 - 0.1 * pebbles
        strength = 5.0
    elif kind == 'rock':
        strata = 0.5 + 0.5 * np.sin((np.mgrid[0:size, 0:size][0] / size * 9 + macro * 3) * np.pi)
        base = tint('#8F887C', np.clip(0.4 * macro + 0.3 * strata + 0.3 * fine, 0, 1), 0.2)
        height = 0.5 * mid + 0.3 * strata + 0.2 * fine
        rough = 0.85 + 0.08 * fine
        strength = 9.0
    elif kind == 'sand':
        ripples = 0.5 + 0.5 * np.sin((np.mgrid[0:size, 0:size][0] / size * 22 + mid * 4) * np.pi * 2)
        base = tint('#CDB98A', np.clip(0.5 * macro + 0.3 * fine + 0.2 * ripples, 0, 1), 0.1)
        height = 0.3 * ripples + 0.2 * fine
        rough = 0.95
        strength = 2.5
    else:
        raise ValueError(kind)
    ao = cavity_ao(height, radius=size / 256 * 3)
    return PbrSet(base, normal_from_height(height, size / 512 * strength), _orm(ao, rough))


def iron(size: int, seed: int) -> PbrSet:
    """Hierro forjado: metal oscuro con óxido en manchas."""
    macro = fractal_noise(size, seed, beta=2.6)
    fine = fractal_noise(size, seed + 1, beta=1.2)
    rust = np.clip((fractal_noise(size, seed + 2, beta=2.2) - 0.6) * 4, 0, 1)
    base = tint('#5E6166', np.clip(0.6 * macro + 0.4 * fine, 0, 1), 0.15)
    base = base * (1 - rust[..., None]) + tint('#7A4A2A', fine, 0.2) * rust[..., None]
    height = 0.5 + 0.1 * fine + 0.2 * rust
    ao = cavity_ao(height)
    orm = np.stack([ao, 0.42 + 0.4 * rust + 0.1 * fine, 1.0 - rust], axis=-1)
    return PbrSet(base, normal_from_height(height, size / 512 * 2.0), orm)


def cloth(size: int, seed: int, color: str) -> PbrSet:
    """Tela tejida (estandartes, toldos): trama fina y pliegues suaves."""
    yy, xx = np.mgrid[0:size, 0:size] / size
    weave = 0.5 + 0.25 * np.sin(xx * size * np.pi / 2) * np.sin(yy * size * np.pi / 2)
    folds = fractal_noise(size, seed, beta=3.0)
    base = tint(color, np.clip(0.7 * folds + 0.3 * weave, 0, 1), 0.18)
    height = 0.7 * folds + 0.1 * weave
    ao = cavity_ao(height, radius=size / 64)
    return PbrSet(base, normal_from_height(height, size / 512 * 4.0), _orm(ao, 0.92))


def water_normal(size: int, seed: int) -> Array:
    """Normal de agua repetible (dos escalas de oleaje)."""
    a = fractal_noise(size, seed, beta=3.2, low_cut=4.0)
    b = fractal_noise(size, seed + 1, beta=2.4, low_cut=12.0)
    return normal_from_height(0.7 * a + 0.3 * b, size / 512 * 14.0)


def water(size: int, seed: int) -> PbrSet:
    """Agua: color casi uniforme (el color real sale del reflejo IBL) y oleaje en la normal."""
    macro = fractal_noise(size, seed + 7, beta=3.0)
    base = tint('#24505c', macro, 0.08)
    orm = np.stack([np.ones((size, size)), np.full((size, size), 0.07), np.zeros((size, size))], axis=-1)
    return PbrSet(base, water_normal(size, seed), orm)


def foliage(size: int, seed: int, color: str) -> PbrSet:
    """Follaje denso visto de lejos: racimos de hojas con huecos oscuros (sin alfa)."""
    leaves = fractal_noise(size, seed, beta=0.9)
    clumps = fractal_noise(size, seed + 1, beta=2.2)
    cells = np.clip((leaves - 0.35) * 2.2, 0, 1)
    height = 0.6 * clumps + 0.4 * cells
    var = np.clip(0.5 * clumps + 0.5 * leaves, 0, 1)
    base = tint(color, var, 0.38, warm_shift=clumps) * (0.55 + 0.45 * cells[..., None])
    ao = cavity_ao(height, radius=size / 128, strength=2.4)
    return PbrSet(base * ao[..., None] ** 0.6, normal_from_height(height, size / 512 * 10.0), _orm(ao, 0.78 + 0.1 * leaves))


def bark(size: int, seed: int, color: str) -> PbrSet:
    """Corteza: surcos verticales (a lo largo de V)."""
    n = size
    white = fractal_noise(n, seed, beta=1.2)
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.rfftfreq(n)[None, :]
    g = np.exp(-2 * (np.pi * 10.0) ** 2 * (fy * fy)) * np.exp(-2 * (np.pi * 0.8) ** 2 * (fx * fx))
    ridges = np.fft.irfft2(np.fft.rfft2(white - 0.5) * g, s=(n, n))
    ridges = (ridges - ridges.min()) / max(np.ptp(ridges), 1e-9)
    height = ridges
    base = tint(color, np.clip(0.7 * ridges + 0.3 * white, 0, 1), 0.3)
    ao = cavity_ao(height, radius=size / 256 * 2, strength=2.0)
    return PbrSet(base * ao[..., None] ** 0.5, normal_from_height(height, size / 512 * 8.0), _orm(ao, 0.9))
