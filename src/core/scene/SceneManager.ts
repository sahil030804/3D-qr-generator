import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { QUALITY_BUDGET, type QualityLevel } from '../generation/types';

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * Owns renderer, cameras, cinematic lighting and environment.
 * Geometry is never altered here (verification only tweaks lighting).
 */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fill!: THREE.DirectionalLight;
  private sky!: THREE.Mesh;
  private animId = 0;
  private camTween: { from: CameraPose; to: CameraPose; t: number; dur: number; onDone?: () => void } | null = null;
  readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    this.camera.position.set(16, 10, 20);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 90;

    this.buildEnvironment();
    this.buildLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildEnvironment(): void {
    // gradient sky dome + distance fog for cinematic depth
    const geo = new THREE.SphereGeometry(240, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#7fa8c9') },
        mid: { value: new THREE.Color('#cfd9de') },
        bot: { value: new THREE.Color('#e8e2d2') },
      },
      vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top,mid,bot;
        void main(){ float h=normalize(vP).y; vec3 c=h>0.12?mix(mid,top,smoothstep(0.12,0.75,h)):mix(bot,mid,smoothstep(-0.25,0.12,h));
        gl_FragColor=vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#d4dade', 60, 200);
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight('#cfe4f7', '#6a6250', 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1dd', 2.2);
    this.sun.position.set(18, 30, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -25;
    this.sun.shadow.camera.right = 25;
    this.sun.shadow.camera.top = 25;
    this.sun.shadow.camera.bottom = -25;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight('#bcd0ff', 0.5);
    this.fill.position.set(-14, 10, -16);
    this.scene.add(this.fill);
  }

  applyQuality(q: QualityLevel): void {
    const b = QUALITY_BUDGET[q];
    const ratio = Math.min(window.devicePixelRatio || 1, b.pixelRatio);
    this.renderer.setPixelRatio(ratio);
    const size = b.shadow;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.resize();
  }

  cinematicPose(worldSize: number): CameraPose {
    const r = worldSize * 0.88;
    return {
      position: new THREE.Vector3(r * 0.85, worldSize * 0.6, r * 1.05),
      target: new THREE.Vector3(0, worldSize * 0.2, 0),
    };
  }

  topPose(worldSize: number): CameraPose {
    const h = worldSize * 1.9;
    return { position: new THREE.Vector3(0, h, 0.001), target: new THREE.Vector3(0, 0, 0) };
  }

  flyTo(pose: CameraPose, dur = 1.6, onDone?: () => void): void {
    if (this.reducedMotion) {
      this.camera.position.copy(pose.position);
      this.controls.target.copy(pose.target);
      onDone?.();
      return;
    }
    this.camTween = {
      from: { position: this.camera.position.clone(), target: this.controls.target.clone() },
      to: pose,
      t: 0,
      dur,
      onDone,
    };
  }

  /** Flat high-contrast lighting for QR decoding. Returns a restore fn. Geometry untouched. */
  verificationLighting(): () => void {
    const prev = {
      sun: this.sun.intensity,
      hemi: this.hemi.intensity,
      fill: this.fill.intensity,
      exposure: this.renderer.toneMappingExposure,
      sunShadow: this.sun.castShadow,
    };
    this.sun.intensity = 2.0;
    this.sun.position.set(4, 40, 2);
    this.sun.castShadow = false; // canopy shadows would darken open (light) modules
    this.hemi.intensity = 1.6;
    this.fill.intensity = 0.9;
    this.renderer.toneMappingExposure = 1.25;
    return () => {
      this.sun.intensity = prev.sun;
      this.sun.position.set(18, 30, 12);
      this.sun.castShadow = prev.sunShadow;
      this.hemi.intensity = prev.hemi;
      this.fill.intensity = prev.fill;
      this.renderer.toneMappingExposure = prev.exposure;
    };
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight * 0.7;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  startLoop(onFrame?: () => void): void {
    const tick = () => {
      this.animId = requestAnimationFrame(tick);
      if (this.camTween) {
        const tw = this.camTween;
        tw.t += 1 / 60 / tw.dur;
        const k = tw.t >= 1 ? 1 : 1 - Math.pow(1 - tw.t, 3);
        this.camera.position.lerpVectors(tw.from.position, tw.to.position, k);
        this.controls.target.lerpVectors(tw.from.target, tw.to.target, k);
        if (tw.t >= 1) {
          this.camTween = null;
          tw.onDone?.();
        }
      }
      this.controls.update();
      onFrame?.();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  stopLoop(): void {
    cancelAnimationFrame(this.animId);
  }
}
