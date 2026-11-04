import { Document, NodeIO, getBounds, type Primitive } from '@gltf-transform/core';
import { BUDGETS, type AssetEntry } from './manifest.js';

export interface GlbReport {
  triangles: number;
  meshes: number;
  materials: number;
  pbrMaterials: number;
  maxTextureSize: number;
  animations: string[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  bytes: number;
  problems: string[];
}

function trianglesOf(p: Primitive): number {
  const idx = p.getIndices();
  const pos = p.getAttribute('POSITION');
  const count = idx ? idx.getCount() : (pos?.getCount() ?? 0);
  const mode = p.getMode();
  if (mode === 4) return Math.floor(count / 3); // TRIANGLES
  if (mode === 5 || mode === 6) return Math.max(0, count - 2); // STRIP / FAN
  return 0;
}

/**
 * Inspección automática de un GLB (G0-05). Detecta problemas objetivos: escala,
 * pivote, materiales no PBR, presupuesto de triángulos/texturas y clips de animación.
 * NO sustituye la revisión visual humana (FR-ART-09).
 */
export async function inspectDocument(
  doc: Document,
  entry: Pick<AssetEntry, 'kind' | 'animations'>,
  bytes = 0,
): Promise<GlbReport> {
  const root = doc.getRoot();
  const budget = BUDGETS[entry.kind];
  const problems: string[] = [];

  let triangles = 0;
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) triangles += trianglesOf(prim);

  const materials = root.listMaterials();
  const pbrMaterials = materials.filter(
    (m) => m.getBaseColorTexture() || m.getBaseColorFactor(),
  ).length;
  let maxTextureSize = 0;
  for (const t of root.listTextures()) {
    const size = t.getSize();
    if (size) maxTextureSize = Math.max(maxTextureSize, size[0], size[1]);
  }
  const animations = root.listAnimations().map((a) => a.getName());

  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const b = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  const min = b.min as [number, number, number];
  const max = b.max as [number, number, number];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

  if (triangles === 0) problems.push('sin geometría');
  if (triangles > budget.maxTriangles)
    problems.push(`triángulos ${triangles} > ${budget.maxTriangles}`);
  if (materials.length > budget.maxMaterials)
    problems.push(`materiales ${materials.length} > ${budget.maxMaterials}`);
  if (maxTextureSize > budget.maxTextureSize)
    problems.push(`textura ${maxTextureSize}px > ${budget.maxTextureSize}px`);
  if (materials.length > 0 && pbrMaterials < materials.length)
    problems.push('materiales sin flujo PBR metallic-roughness');
  if (bytes > budget.maxBytes) problems.push(`tamaño ${bytes} B > ${budget.maxBytes} B`);

  // Escala en metros y pivote en la base (y≈0) centrado en XZ.
  const tallest = Math.max(...size);
  if (tallest < 0.3 || tallest > 120)
    problems.push(`escala sospechosa: dimensión máx. ${tallest.toFixed(2)} m`);
  if (Math.abs(min[1]) > 0.05 * Math.max(1, size[1]!))
    problems.push(`pivote: la base no está en y=0 (min.y=${min[1].toFixed(3)})`);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  if (Math.hypot(cx, cz) > 0.1 * Math.max(size[0]!, size[2]!, 1))
    problems.push('pivote: no centrado en XZ');

  for (const clip of entry.animations ?? [])
    if (!animations.includes(clip)) problems.push(`falta animación ${clip}`);

  return {
    triangles,
    meshes: root.listMeshes().length,
    materials: materials.length,
    pbrMaterials,
    maxTextureSize,
    animations,
    bounds: { min, max },
    bytes,
    problems,
  };
}

export async function inspectGlbFile(
  path: string,
  entry: Pick<AssetEntry, 'kind' | 'animations'>,
): Promise<GlbReport> {
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(path);
  const doc = await new NodeIO().readBinary(new Uint8Array(buf));
  return inspectDocument(doc, entry, buf.byteLength);
}
