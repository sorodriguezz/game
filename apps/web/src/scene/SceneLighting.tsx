import { useEffect } from 'react';
import { useApp } from '@playcanvas/react/hooks';
import {
  ADDRESS_CLAMP_TO_EDGE,
  ADDRESS_REPEAT,
  Asset,
  CameraFrame,
  Color,
  EnvLighting,
  FOG_LINEAR,
  SSAOTYPE_LIGHTING,
  TEXTUREPROJECTION_EQUIRECT,
  TONEMAP_ACES,
  type AppBase,
  type Entity,
  type Texture,
} from 'playcanvas';
import type { GraphicsProfile } from './graphics.js';

/**
 * Iluminación de escena (Art Bible §10): IBL con un HDRI de cielo CC0
 * (Poly Haven vía @pmndrs/assets), tone mapping ACES, niebla del color del
 * horizonte y, en perfil Alto, CameraFrame con SSAO, bloom y gradación.
 */

const envCache = new WeakMap<AppBase, Promise<Texture>>();

function loadEnvAtlas(app: AppBase, url: string): Promise<Texture> {
  let p = envCache.get(app);
  if (!p) {
    p = new Promise<Texture>((resolve, reject) => {
      const asset = new Asset(url, 'texture', { url }, { mipmaps: false });
      asset.once('load', () => {
        const hdr = asset.resource as Texture;
        hdr.projection = TEXTUREPROJECTION_EQUIRECT;
        hdr.addressU = ADDRESS_REPEAT;
        hdr.addressV = ADDRESS_CLAMP_TO_EDGE;
        const source = EnvLighting.generateLightingSource(hdr);
        const atlas = EnvLighting.generateAtlas(source);
        source.destroy();
        resolve(atlas);
      });
      asset.once('error', (e: unknown) => reject(new Error(String(e))));
      app.assets.add(asset);
      app.assets.load(asset);
    });
    envCache.set(app, p);
  }
  return p;
}

export function SceneLighting({
  profile,
  camera,
  fog = { color: '#bfd0da', start: 150, end: 520 },
  envUrl = '/assets/env/park.hdr',
  envIntensity = 1,
  exposure = 1.05,
}: {
  profile: GraphicsProfile;
  camera: React.MutableRefObject<Entity | null>;
  fog?: { color: string; start: number; end: number };
  envUrl?: string;
  envIntensity?: number;
  exposure?: number;
}) {
  const app = useApp();

  useEffect(() => {
    const scene = app.scene;
    scene.fog.type = FOG_LINEAR;
    scene.fog.color = new Color().fromString(fog.color);
    scene.fog.start = fog.start;
    scene.fog.end = fog.end;
    scene.exposure = exposure;
    scene.skyboxIntensity = envIntensity;
    // Sin IBL todavía: ambiente neutro tenue; con IBL el ambiente sale del atlas.
    scene.ambientLight = new Color(0.32, 0.34, 0.38);
    let alive = true;
    loadEnvAtlas(app, envUrl)
      .then((atlas) => {
        if (!alive) return;
        scene.envAtlas = atlas;
        scene.ambientLight = new Color(0, 0, 0);
      })
      .catch(() => {
        /* sin HDRI se mantiene el ambiente plano */
      });
    return () => {
      alive = false;
    };
  }, [app, envUrl, envIntensity, exposure, fog.color, fog.start, fog.end]);

  useEffect(() => {
    app.graphicsDevice.maxPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      profile.maxPixelRatio,
    );
    const cam = camera.current?.camera;
    if (!cam) return;
    let frame: CameraFrame | null = null;
    if (profile.post) {
      frame = new CameraFrame(app, cam);
      frame.rendering.toneMapping = TONEMAP_ACES;
      frame.rendering.samples = 4;
      frame.ssao.type = SSAOTYPE_LIGHTING;
      frame.ssao.intensity = 0.35;
      frame.ssao.radius = 1.6;
      frame.ssao.blurEnabled = true;
      frame.bloom.intensity = 0.012;
      frame.bloom.blurLevel = 14;
      frame.grading.enabled = true;
      frame.grading.contrast = 1.06;
      frame.grading.saturation = 1.05;
      frame.vignette.intensity = 0.25;
      frame.vignette.inner = 0.55;
      frame.vignette.outer = 1.3;
      frame.update();
    } else {
      cam.toneMapping = TONEMAP_ACES;
    }
    return () => {
      frame?.destroy();
    };
  }, [app, camera, profile]);

  return null;
}
