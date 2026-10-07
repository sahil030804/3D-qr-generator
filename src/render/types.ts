import type { ViewState } from './camera';
import type { Lighting } from './lighting';
import type { Mesh } from './mesher';

export interface ViewRenderer {
  readonly kind: 'webgl' | 'canvas';
  setMesh(mesh: Mesh): void;
  setLighting(lighting: Lighting): void;
  /** Size the drawing buffer. Width and height are in device pixels. */
  resize(width: number, height: number): void;
  render(view: ViewState): void;
  dispose(): void;
}
