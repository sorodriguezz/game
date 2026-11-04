// El motor publica sus scripts ESM sin declaraciones de tipos.
declare module 'playcanvas/scripts/esm/camera-controls.mjs' {
  import type { Script } from 'playcanvas';
  export class CameraControls extends Script {}
}
