import { z } from 'zod';

/**
 * Contrato del catálogo de assets (FR-ART-03, ADR-0008). Evoluciona
 * `specs/asset-manifest.example.json`: añade estado de aprobación y reglas
 * que impiden marcar como APPROVED un asset sin licencia, validaciones ni GLB.
 */
export const ASSET_KINDS = ['building', 'unit', 'ship', 'prop', 'terrain', 'wonder'] as const;
export const ASSET_STATUSES = ['BLOCKOUT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
const CHECK = z.enum(['PENDING', 'PASS', 'FAIL']);

export const assetEntrySchema = z
  .object({
    /** `tipo` o `tipo.civilización.sN` para variantes por civilización/etapa. */
    assetId: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/),
    kind: z.enum(ASSET_KINDS),
    status: z.enum(ASSET_STATUSES),
    /** Ruta relativa a la raíz pública del cliente; null mientras sea blockout. */
    file: z
      .string()
      .regex(/\.glb$/)
      .nullable(),
    civilization: z.enum(['imperial_crown', 'sea_league']).optional(),
    /** Tipo de juego al que representa (p. ej. `barracks`); el cliente busca por tipo+civ+etapa. */
    type: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .optional(),
    /** Orientación de autoría: `plaza` = puerta hacia el centro de la ciudad; `outward` = hacia fuera (puerto → mar). */
    facing: z.enum(['plaza', 'outward']).optional(),
    /** Triángulos por LOD (LOD0 primero). */
    triangles: z.array(z.number().int().nonnegative()).optional(),
    /** Materiales compartidos de la biblioteca (`assets/materials/library.json`). */
    materials: z.array(z.string()).optional(),
    dimensionsMeters: z.tuple([z.number(), z.number(), z.number()]).optional(),
    bytes: z.number().int().nonnegative().optional(),
    /** Partes bajo el suelo a propósito (pilotes en el agua, rocas enterradas). */
    belowGroundOk: z.boolean().optional(),
    version: z.number().int().positive().optional(),
    visualStage: z.number().int().min(1).max(3).optional(),
    units: z.literal('meters').optional(),
    lodCount: z.number().int().min(0).max(4).optional(),
    /** Miniatura de revisión (captura en motor), FR-ART-03. */
    thumbnail: z
      .string()
      .regex(/\.(png|webp|jpg)$/)
      .nullable()
      .optional(),
    animations: z.array(z.string()).optional(),
    source: z
      .object({
        workflow: z.string().min(1),
        provider: z.string().min(1),
        author: z.string().min(1),
        license: z.string().min(1),
        createdAt: z.string().optional(),
      })
      .optional(),
    validation: z
      .object({
        geometry: CHECK,
        materials: CHECK,
        engineScreenshot: CHECK,
        performance: CHECK,
        humanApproval: CHECK,
      })
      .optional(),
  })
  .superRefine((a, ctx) => {
    if (a.status !== 'APPROVED') return;
    const issue = (message: string) =>
      ctx.addIssue({ code: 'custom', message: `${a.assetId}: ${message}` });
    if (!a.file) issue('APPROVED exige archivo GLB');
    if (!a.thumbnail) issue('APPROVED exige miniatura de revisión');
    if (!a.source) issue('APPROVED exige procedencia (source)');
    else if (/REQUIRED|UNKNOWN|TBD/i.test(a.source.license))
      issue('APPROVED exige licencia verificada');
    if (!a.validation) issue('APPROVED exige validaciones');
    else
      for (const [k, v] of Object.entries(a.validation))
        if (v !== 'PASS') issue(`validación ${k} = ${v}`);
    if (a.kind === 'unit') {
      for (const clip of ['idle', 'walk', 'attack', 'death']) {
        if (!a.animations?.includes(clip)) issue(`unidad sin animación ${clip} (FR-ART-04)`);
      }
    }
    if (a.kind === 'ship') {
      for (const clip of ['idle', 'sail'])
        if (!a.animations?.includes(clip)) issue(`barco sin animación ${clip}`);
    }
  });
export type AssetEntry = z.infer<typeof assetEntrySchema>;

export const assetManifestSchema = z
  .object({
    $comment: z.string().optional(),
    styleVersion: z.string().min(1),
    assets: z.array(assetEntrySchema),
  })
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    for (const a of m.assets) {
      if (seen.has(a.assetId))
        ctx.addIssue({ code: 'custom', message: `assetId duplicado: ${a.assetId}` });
      seen.add(a.assetId);
    }
  });
export type AssetManifest = z.infer<typeof assetManifestSchema>;

/** Presupuestos por tipo (hipótesis iniciales; se revisan con medición real, NFR-004/005). */
export const BUDGETS: Record<
  (typeof ASSET_KINDS)[number],
  { maxTriangles: number; maxMaterials: number; maxTextureSize: number; maxBytes: number }
> = {
  building: { maxTriangles: 25_000, maxMaterials: 6, maxTextureSize: 2048, maxBytes: 6_000_000 },
  unit: { maxTriangles: 8_000, maxMaterials: 3, maxTextureSize: 1024, maxBytes: 3_000_000 },
  ship: { maxTriangles: 12_000, maxMaterials: 4, maxTextureSize: 1024, maxBytes: 4_000_000 },
  prop: { maxTriangles: 3_000, maxMaterials: 2, maxTextureSize: 512, maxBytes: 1_000_000 },
  terrain: { maxTriangles: 60_000, maxMaterials: 4, maxTextureSize: 2048, maxBytes: 10_000_000 },
  wonder: { maxTriangles: 60_000, maxMaterials: 8, maxTextureSize: 2048, maxBytes: 12_000_000 },
};
