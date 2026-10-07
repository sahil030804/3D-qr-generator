import * as THREE from 'three';
import { SceneManager } from '../core/scene/SceneManager';
import { generateVerifiedScene, type VerifiedScene } from '../core/verification/QRValidator';
import { QRInputError } from '../core/qr/QRGenerator';
import type { GeneratorParams, QualityLevel } from '../core/generation/types';
import { PRESETS, getPreset } from '../presets';
import { disposeObject } from '../presets/shared';
import { exportPNG, exportGLB, encodeConfig, decodeConfig } from '../export/Exporter';

interface ShareConfig {
  content: string;
  preset: string;
  params: GeneratorParams;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function slider(
  parent: HTMLElement, label: string, min: number, max: number, step: number, value: number,
  onInput: (v: number) => void, format: (v: number) => string = (v) => v.toFixed(2),
): { input: HTMLInputElement; out: HTMLOutputElement } {
  const wrap = el('div', 'ctl');
  const lab = el('label', 'ctl-label', label);
  const id = `ctl-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(min); input.max = String(max);
  input.step = String(step); input.value = String(value); input.id = id;
  const out = document.createElement('output');
  out.htmlFor = id; out.textContent = format(value);
  lab.htmlFor = id;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  wrap.append(lab, input, out);
  parent.append(wrap);
  return { input, out };
}

export class App {
  private manager: SceneManager;
  private current: VerifiedScene | null = null;
  private generating = false;
  private params: GeneratorParams = {
    seed: 20260707, density: 0.85, height: 0.8, variation: 0.55,
    qrStrength: 0.85, flowerDensity: 0.8, foliageDensity: 0.9, sceneScale: 1, quality: 'high',
  };
  private presetId = 'cherry-blossom';
  private content = 'https://example.com/hidden-garden';
  private ui: Record<string, HTMLElement> = {};
  private debugCanvasMatrix!: HTMLCanvasElement;
  private debugCanvasField!: HTMLCanvasElement;
  private debugTopImg!: HTMLImageElement;

  constructor(private root: HTMLElement) {
    root.classList.add('app');
    this.buildShell();
    const canvas = this.ui['viewport'].querySelector('canvas')!;
    this.manager = new SceneManager(canvas);
    if (window.innerWidth < 760) this.params.quality = 'preview';
    this.manager.applyQuality(this.params.quality);
    this.restoreFromURL();
    this.syncControls();
    this.manager.startLoop();
    this.bindKeys();
    void this.generate();
  }

  // ---------------- shell ----------------
  private buildShell(): void {
    const header = el('header', 'topbar');
    const brand = el('div', 'brand');
    brand.append(el('span', 'brand-mark', '◍'), el('span', 'brand-name', 'QR Grove · Cinematic 3D QR Studio'));
    const badge = el('div', 'verify-badge idle', 'Not verified yet');
    badge.id = 'verify-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    header.append(brand, badge);
    this.ui['badge'] = badge;

    const layout = el('div', 'layout');
    const side = el('aside', 'panel');
    side.setAttribute('aria-label', 'Scene controls');

    // QR content
    const secQR = el('section', 'card');
    secQR.append(el('h2', 'card-title', 'QR Content'));
    const ta = document.createElement('textarea');
    ta.id = 'qr-content'; ta.rows = 2; ta.maxLength = 1200;
    ta.value = this.content;
    ta.setAttribute('aria-label', 'QR text or URL');
    const genBtn = document.createElement('button');
    genBtn.className = 'btn primary'; genBtn.id = 'generate-btn'; genBtn.textContent = 'Generate scene';
    const hint = el('p', 'muted', 'Error correction: HIGH · up to ~1,200 chars');
    secQR.append(ta, genBtn, hint);
    this.ui['content'] = ta; this.ui['generate'] = genBtn;

    // presets
    const secP = el('section', 'card');
    secP.append(el('h2', 'card-title', 'Scene preset'));
    const grid = el('div', 'preset-grid');
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', 'Scene presets');
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.className = 'preset'; b.dataset.preset = p.id;
      b.setAttribute('role', 'option');
      b.title = p.description;
      const ic = el('span', 'preset-icon', p.icon);
      const nm = el('span', 'preset-name', p.name);
      b.append(ic, nm);
      b.addEventListener('click', () => {
        this.presetId = p.id;
        this.syncPresets();
        void this.generate();
      });
      grid.append(b);
    }
    secP.append(grid);
    this.ui['presets'] = grid;

    // appearance
    const secA = el('section', 'card');
    secA.append(el('h2', 'card-title', 'Appearance'));
    const adv = el('div', 'sliders');
    this.ui['sliders'] = adv;
    secA.append(adv);
    const seedRow = el('div', 'seed-row');
    const seedInput = document.createElement('input');
    seedInput.id = 'seed'; seedInput.type = 'number'; seedInput.value = String(this.params.seed);
    seedInput.setAttribute('aria-label', 'Random seed');
    const dice = document.createElement('button');
    dice.className = 'btn ghost'; dice.textContent = '🎲 Randomize';
    dice.addEventListener('click', () => {
      this.params.seed = Math.floor(Math.random() * 1e9);
      seedInput.value = String(this.params.seed);
      void this.generate();
    });
    seedInput.addEventListener('change', () => {
      this.params.seed = parseInt(seedInput.value || '0', 10) || 0;
      void this.generate();
    });
    seedRow.append(el('label', 'ctl-label', 'Seed'), seedInput, dice);
    secA.append(seedRow);
    this.ui['seed'] = seedInput;
    // quality
    const qRow = el('div', 'seg');
    qRow.setAttribute('role', 'group');
    qRow.setAttribute('aria-label', 'Quality');
    for (const q of ['preview', 'high', 'cinematic'] as QualityLevel[]) {
      const b = document.createElement('button');
      b.className = 'seg-btn'; b.dataset.quality = q;
      b.textContent = q[0].toUpperCase() + q.slice(1);
      b.addEventListener('click', () => {
        this.params.quality = q;
        this.manager.applyQuality(q);
        this.syncQuality();
        void this.generate();
      });
      qRow.append(b);
    }
    secA.append(el('h3', 'sub', 'Quality'), qRow);
    this.ui['quality'] = qRow;

    // advanced
    const details = document.createElement('details');
    details.className = 'advanced';
    const summary = document.createElement('summary');
    summary.textContent = 'Advanced';
    details.append(summary);
    const advBox = el('div', 'sliders');
    this.ui['advanced'] = advBox;
    details.append(advBox);
    secA.append(details);

    // camera + export
    const secC = el('section', 'card');
    secC.append(el('h2', 'card-title', 'Camera & export'));
    const camRow = el('div', 'btn-row');
    const mkBtn = (label: string, fn: () => void, primary = false) => {
      const b = document.createElement('button');
      b.className = `btn${primary ? ' primary' : ''}`;
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    camRow.append(
      mkBtn('◉ Reveal QR', () => this.reveal(), true),
      mkBtn('Top view', () => this.toTop()),
      mkBtn('Perspective', () => this.toPerspective()),
      mkBtn('Reset', () => this.toPerspective()),
    );
    const expRow = el('div', 'btn-row');
    expRow.append(
      mkBtn('PNG · cinematic', () => this.exportCinematic()),
      mkBtn('PNG · QR', () => this.exportQRView()),
      mkBtn('GLB · 3D', () => this.exportScene()),
      mkBtn('Copy share link', () => this.share()),
    );
    secC.append(camRow, expRow);

    // debug
    const secD = el('section', 'card');
    const dHead = el('h2', 'card-title', 'Verification & debug');
    const dbgToggle = document.createElement('button');
    dbgToggle.className = 'btn ghost'; dbgToggle.textContent = 'Show debug';
    dbgToggle.setAttribute('aria-expanded', 'false');
    const dbg = el('div', 'debug hidden');
    dbg.append(el('h3', 'sub', 'QR matrix (ground truth)'));
    this.debugCanvasMatrix = document.createElement('canvas');
    this.debugCanvasMatrix.className = 'debug-canvas';
    dbg.append(this.debugCanvasMatrix);
    dbg.append(el('h3', 'sub', 'Continuous QR field'));
    this.debugCanvasField = document.createElement('canvas');
    this.debugCanvasField.className = 'debug-canvas';
    dbg.append(this.debugCanvasField);
    dbg.append(el('h3', 'sub', 'Decoded top-down view'));
    this.debugTopImg = document.createElement('img');
    this.debugTopImg.className = 'debug-canvas';
    this.debugTopImg.alt = 'Binarized top-down render used by the decoder';
    dbg.append(this.debugTopImg);
    const stats = el('dl', 'stats');
    stats.id = 'stats';
    dbg.append(stats);
    this.ui['stats'] = stats;
    dbgToggle.addEventListener('click', () => {
      const hidden = dbg.classList.toggle('hidden');
      dbgToggle.textContent = hidden ? 'Show debug' : 'Hide debug';
      dbgToggle.setAttribute('aria-expanded', String(!hidden));
    });
    secD.append(dHead, dbgToggle, dbg);

    side.append(secQR, secP, secA, secC, secD);

    const main = el('main', 'viewport-wrap');
    const viewport = el('div', 'viewport');
    viewport.id = 'viewport';
    const canvas = document.createElement('canvas');
    canvas.id = 'gl';
    canvas.setAttribute('aria-label', '3D scene viewport. Drag to orbit, scroll to zoom.');
    canvas.tabIndex = 0;
    viewport.append(canvas);
    const overlay = el('div', 'overlay');
    const spinner = el('div', 'spinner hidden', '');
    spinner.id = 'spinner';
    const toast = el('div', 'toast hidden', '');
    toast.id = 'toast';
    toast.setAttribute('role', 'alert');
    const chip = el('div', 'chip', 'Drag to orbit · scroll to zoom · R reveals QR');
    overlay.append(spinner, toast, chip);
    main.append(viewport, overlay);
    this.ui['viewport'] = viewport;
    this.ui['spinner'] = spinner;
    this.ui['toast'] = toast;

    layout.append(side, main);
    this.root.append(header, layout);
    genBtn.addEventListener('click', () => void this.generate());
    ta.addEventListener('keydown', (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') void this.generate();
    });
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (ev) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      const k = ev.key.toLowerCase();
      if (k === 'r') this.reveal();
      else if (k === 't') this.toTop();
      else if (k === 'p') this.toPerspective();
    });
  }

  private syncControls(): void {
    const adv = this.ui['sliders'];
    adv.innerHTML = '';
    const P = this.params;
    const regen = () => void this.generate();
    slider(adv, 'Density', 0.2, 1.2, 0.01, P.density, (v) => { P.density = v; regen(); });
    slider(adv, 'Height', 0.2, 1.4, 0.01, P.height, (v) => { P.height = v; regen(); });
    slider(adv, 'Natural variation', 0, 1, 0.01, P.variation, (v) => { P.variation = v; regen(); });
    slider(adv, 'QR strength', 0.3, 1, 0.01, P.qrStrength, (v) => { P.qrStrength = v; regen(); });
    slider(adv, 'Flower density', 0, 1.2, 0.01, P.flowerDensity, (v) => { P.flowerDensity = v; regen(); });
    slider(adv, 'Foliage density', 0, 1.2, 0.01, P.foliageDensity, (v) => { P.foliageDensity = v; regen(); });
    slider(adv, 'Scene scale', 0.7, 1.4, 0.01, P.sceneScale, (v) => { P.sceneScale = v; regen(); });
    const seed = this.ui['seed'] as HTMLInputElement;
    if (seed) seed.value = String(P.seed);
    this.syncPresets();
    this.syncQuality();
  }

  private syncPresets(): void {
    this.ui['presets'].querySelectorAll('.preset').forEach((b) => {
      const on = (b as HTMLElement).dataset.preset === this.presetId;
      (b as HTMLElement).classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  private syncQuality(): void {
    this.ui['quality'].querySelectorAll('.seg-btn').forEach((b) => {
      (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.quality === this.params.quality);
    });
  }

  private setBadge(state: 'idle' | 'working' | 'ok' | 'fail', text: string): void {
    const b = this.ui['badge'];
    b.className = `verify-badge ${state}`;
    b.textContent = text;
  }

  private toast(msg: string): void {
    const t = this.ui['toast'];
    t.textContent = msg;
    t.classList.remove('hidden');
    window.clearTimeout((t as unknown as { _h?: number })._h);
    (t as unknown as { _h?: number })._h = window.setTimeout(() => t.classList.add('hidden'), 6000);
  }

  // ---------------- generation ----------------
  async generate(): Promise<void> {
    if (this.generating) return;
    this.generating = true;
    const genBtn = this.ui['generate'] as HTMLButtonElement;
    genBtn.disabled = true;
    this.ui['spinner'].classList.remove('hidden');
    const ta = this.ui['content'] as HTMLTextAreaElement;
    this.content = ta.value;
    try {
      if (this.current) {
        this.manager.scene.remove(this.current.group);
        disposeObject(this.current.group);
        this.current = null;
      }
      const preset = getPreset(this.presetId);
      this.setBadge('working', 'Generating…');
      const verified = await generateVerifiedScene(
        this.manager.renderer,
        this.manager.scene,
        {
          content: this.content,
          presetId: this.presetId,
          params: { ...this.params },
          lighting: () => this.manager.verificationLighting(),
        },
        { onAttempt: (n, note) => this.setBadge('working', `Verifying… ${note}`) },
      );
      this.current = verified;
      const ok = verified.result.success && verified.result.data === verified.content;
      this.setBadge(ok ? 'ok' : 'fail', ok ? `✓ QR Verified · ${verified.attempts} attempt${verified.attempts > 1 ? 's' : ''}` : '✗ Not decodable — try stronger QR strength');
      if (!ok) this.toast('Top-down decode failed after 8 attempts. Raise QR strength / density, or shorten the content.');
      // debug views
      verified.field.drawToCanvas(this.debugCanvasMatrix, 5);
      verified.field.drawFieldToCanvas(this.debugCanvasField, 140);
      this.debugTopImg.src = verified.result.debugUrl;
      this.renderStats(verified);
      this.persistURL();
      // frame the new scene cinematically on first load / preset change
      const worldSize = preset.qrWorldSize * (this.params.sceneScale || 1);
      this.manager.flyTo(this.manager.cinematicPose(worldSize), 1.4);
    } catch (err) {
      if (err instanceof QRInputError) this.toast(err.message);
      else {
        console.error(err);
        this.toast('Generation failed. Try shorter content or a different preset.');
      }
      this.setBadge('fail', 'Generation failed');
    } finally {
      this.generating = false;
      genBtn.disabled = false;
      this.ui['spinner'].classList.add('hidden');
    }
  }

  private renderStats(v: VerifiedScene): void {
    const stats = this.ui['stats'];
    stats.innerHTML = '';
    const info = this.manager.renderer.info;
    let objects = 0;
    v.group.traverse((o) => {
      const mm = o as THREE.Mesh & { isInstancedMesh?: boolean };
      if (mm.isMesh || mm.isInstancedMesh) objects++;
    });
    const rows: [string, string][] = [
      ['Status', v.result.success ? 'Verified ✓' : 'Failed'],
      ['Attempts', String(v.attempts)],
      ['Preset', getPreset(this.presetId).name],
      ['Resolution', `${v.result.resolution} × ${v.result.resolution}`],
      ['Contrast', v.result.contrast.toFixed(2)],
      ['Module agreement', `${Math.round(v.result.agreement * 100)}% (dark ${Math.round(v.result.darkMean)} / light ${Math.round(v.result.lightMean)})`],
      ['Generation', `${Math.round(v.generationMs)} ms`],
      ['Objects', String(objects)],
      ['Triangles', info.render.triangles.toLocaleString()],
      ['Seed', String(v.params.seed)],
    ];
    for (const [k, val] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = val;
      stats.append(dt, dd);
    }
  }

  private worldSize(): number {
    return getPreset(this.presetId).qrWorldSize * (this.params.sceneScale || 1);
  }

  reveal(): void {
    this.manager.flyTo(this.manager.topPose(this.worldSize()), 2.4, () => {
      if (this.current?.result.success) this.setBadge('ok', '✓ QR Verified — top view');
    });
    this.toast('Gliding overhead — watch the canopy resolve into the code.');
  }

  toTop(): void {
    this.manager.flyTo(this.manager.topPose(this.worldSize()), 1.4);
  }

  toPerspective(): void {
    this.manager.flyTo(this.manager.cinematicPose(this.worldSize()), 1.4);
  }

  exportCinematic(): void {
    if (!this.current) return;
    exportPNG(this.manager.renderer, this.manager.scene, this.manager.camera, `qr-scene-${this.presetId}-cinematic`);
  }

  exportQRView(): void {
    if (!this.current) return;
    const S = this.worldSize();
    const half = S * 0.52;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, S * 4);
    cam.position.set(0, S * 2, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    const restore = this.manager.verificationLighting();
    exportPNG(this.manager.renderer, this.manager.scene, cam, `qr-scene-${this.presetId}-qr`);
    restore();
  }

  exportScene(): void {
    if (!this.current) return;
    exportGLB(this.current.group, `qr-scene-${this.presetId}`, (m) => this.toast(m));
  }

  private persistURL(): void {
    const cfg: ShareConfig = { content: this.content, preset: this.presetId, params: this.params };
    history.replaceState(null, '', `#s=${encodeConfig(cfg as unknown as Record<string, unknown>)}`);
  }

  private restoreFromURL(): void {
    const h = location.hash.match(/#s=([A-Za-z0-9\-_]+)/);
    if (!h) return;
    const cfg = decodeConfig<ShareConfig>(h[1]);
    if (!cfg) return;
    if (typeof cfg.content === 'string' && cfg.content.length <= 1200) {
      this.content = cfg.content;
      (this.ui['content'] as HTMLTextAreaElement).value = cfg.content;
    }
    if (typeof cfg.preset === 'string' && PRESETS.some((p) => p.id === cfg.preset)) this.presetId = cfg.preset;
    if (cfg.params && typeof cfg.params === 'object') {
      const p = cfg.params as Partial<GeneratorParams>;
      for (const k of ['seed', 'density', 'height', 'variation', 'qrStrength', 'flowerDensity', 'foliageDensity', 'sceneScale'] as const) {
        if (typeof p[k] === 'number' && Number.isFinite(p[k])) (this.params[k] as number) = p[k] as number;
      }
      if (p.quality === 'preview' || p.quality === 'high' || p.quality === 'cinematic') this.params.quality = p.quality;
    }
  }

  private share(): void {
    this.persistURL();
    const url = location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => this.toast('Share link copied.'), () => this.toast('Copy failed — copy the URL manually.'));
    } else this.toast('Copy the URL from the address bar to share.');
  }
}
