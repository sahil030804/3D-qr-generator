import { generateQRMatrix, MAX_QR_CHARS, QRInputError, type QRData } from '../core/qr/QRGenerator';
import { qrToSvg } from '../core/qr/qrSvg';
import { getObject, OBJECTS, type VoxelObject } from '../objects';
import { LIGHTING, TIMES_OF_DAY, type TimeOfDay } from '../render/lighting';
import { buildMesh } from '../render/mesher';
import { Viewer, type ViewerState } from '../render/Viewer';
import { buildModel } from '../voxel/buildModel';
import { ICONS, LOGO } from './icons';
import { IDLE_ELEVATION } from '../render/timeline';
import { embedSnippet, embedUrl, parseCommand, parseEmbed, type EmbedEvent, type EmbedOptions } from './embed';
import { PhotoReadError, PhotoSession } from './photoSession';
import { readState, writeQuery, type AppState } from './state';
import { decodeImage } from './verify';
import type { LookName } from '../photo/scanColors';

const DEFAULT_STATE: AppState = { text: 'https://example.com', objectId: OBJECTS[0].id, variantId: OBJECTS[0].variants[0].id, time: 'night' };
const TIME_LABELS: Record<TimeOfDay, string> = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

type VerifyState = 'idle' | 'checking' | 'ok' | 'fail';
type LookChoice = 'auto' | LookName;

/** Id used for the uploaded-photo mode; it is not one of the built-in objects. */
const PHOTO_ID = 'photo';
const LOOK_LABELS: [LookChoice, string, string][] = [
  ['auto', 'Auto', 'Pick the most photo-like look that still scans'],
  ['soft', 'Photo-like', 'Keeps your photo as it is'],
  ['firm', 'Balanced', 'A little firmer for tougher scanners'],
  ['max', 'Easy scan', 'Strongest, easiest for any phone'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** Copy text to the clipboard, falling back to the legacy path where the async API is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export class App {
  private state: AppState;
  private qr: QRData | null = null;
  private readonly viewer: Viewer;
  private generation = 0;
  private debounce = 0;
  private toastTimer = 0;

  private readonly stage = el('div', 'stage');
  private readonly input = el('input', 'link-input');
  private readonly counter = el('span', 'counter');
  private readonly hint = el('p', 'hint');
  private readonly verify = el('div', 'verify');
  private readonly verifyText = el('span');
  private readonly loading = el('div', 'loading');
  private readonly status = el('p', 'status');
  private readonly toast = el('div', 'toast');
  private readonly revealButton = el('button', 'btn primary');
  private readonly saveButton = el('button', 'btn ghost');
  private readonly saveMenu = el('div', 'menu');
  private readonly dock = el('section', 'dock');
  private readonly variantRow = el('div', 'variants');
  private readonly embed: EmbedOptions | null = parseEmbed(window.location.search);
  private readonly embedBar = el('div', 'embed-controls');
  private readonly embedHint = el('p', 'embed-hint', 'Drag to rotate · tap to reveal the QR');
  private readonly embedButton = el('button', 'embed-btn');
  private embedStarted = false;
  private readonly photo = new PhotoSession();
  private readonly scanOverlay = el('div', 'scan-overlay');
  private readonly scanImage = el('img');
  private scanUrl: string | null = null;
  private readonly fileInput = el('input');
  private readonly photoRow = el('div', 'photo-options');
  private readonly photoName = el('span', 'photo-name');
  private readonly dropOverlay = el('div', 'drop-overlay', 'Drop a photo to turn it into a 3D relief');
  private readonly loadingText = el('span', '', 'Building your model…');
  private readonly lookInputs = new Map<LookChoice, HTMLInputElement>();
  private look: LookChoice = 'auto';
  /** The built-in object to restore (and to write into share links) while photo mode is active. */
  private regular = { objectId: OBJECTS[0].id, variantId: OBJECTS[0].variants[0].id };
  private readonly objectInputs = new Map<string, HTMLInputElement>();
  private readonly timeInputs = new Map<TimeOfDay, HTMLInputElement>();

  constructor(private readonly root: HTMLElement) {
    this.state = readState(window.location.search, DEFAULT_STATE);
    if (this.embed) {
      if (this.embed.text) this.state.text = this.embed.text;
      if (!this.embed.timeGiven) this.state.time = 'day';
    } else if (!window.location.search && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
      this.state.time = 'day';
    }
    root.classList.add('app');
    if (this.embed) {
      root.classList.add('embed');
      root.dataset.bg = this.embed.background;
      if (this.embed.background === 'transparent') document.documentElement.classList.add('embed-transparent');
    }

    this.regular = { objectId: this.state.objectId, variantId: this.state.variantId };
    root.append(this.buildSky(), this.stage, this.buildTopbar(), this.hint, this.buildDock(), this.loading, this.toast, this.buildInfo(), this.dropOverlay, this.buildScanOverlay(), this.buildEmbedControls());
    this.viewer = new Viewer(this.stage, (viewerState) => this.onViewer(viewerState));
    this.viewer.setTimeOfDay(this.state.time);
    this.applyTime();
    if (this.embed) this.startEmbed(this.embed);

    new ResizeObserver(() => this.syncInsets()).observe(this.dock);
    document.addEventListener('keydown', (event) => this.onKey(event));
    document.addEventListener('click', (event) => {
      const target = event.target as Node;
      if (!this.saveMenu.hidden && !this.saveMenu.contains(target) && !this.saveButton.contains(target)) this.closeMenu();
    });

    this.attachDrop();
    this.syncInsets();
    this.onViewer({ mode: 'object', busy: false, renderer: this.viewer.rendererKind });
    void this.generate();
  }

  // ---------- Structure ----------

  private buildSky(): HTMLElement {
    const sky = el('div', 'sky');
    sky.setAttribute('aria-hidden', 'true');
    for (const time of TIMES_OF_DAY) {
      const layer = el('div', `sky-layer ${time}`);
      layer.dataset.time = time;
      sky.append(layer);
    }
    sky.append(el('div', 'stars'), el('div', 'vignette'));
    return sky;
  }

  private buildTopbar(): HTMLElement {
    const bar = el('header', 'topbar');
    const brand = el('a', 'brand');
    brand.href = window.location.pathname;
    brand.setAttribute('aria-label', 'Voxel QR');
    const mark = el('span', 'brand-mark');
    mark.innerHTML = LOGO;
    brand.append(mark, el('span', 'brand-name', 'Voxel QR'));

    this.verify.setAttribute('role', 'status');
    this.verify.dataset.state = 'idle';
    this.verify.append(el('span', 'dot'), this.verifyText);

    const actions = el('div', 'top-actions');
    const share = el('button', 'icon-btn');
    share.type = 'button';
    share.innerHTML = ICONS.share;
    share.setAttribute('aria-label', 'Copy share link');
    share.title = 'Copy share link';
    share.addEventListener('click', () => void this.share());
    const info = el('button', 'icon-btn');
    info.type = 'button';
    info.innerHTML = ICONS.info;
    info.setAttribute('aria-label', 'How it works');
    info.title = 'How it works';
    info.addEventListener('click', () => (this.root.querySelector('dialog') as HTMLDialogElement).showModal());
    actions.append(share, info);

    bar.append(brand, this.verify, actions);
    return bar;
  }

  private buildDock(): HTMLElement {
    const dock = this.dock;
    dock.setAttribute('aria-label', 'Controls');

    // Row 1: link field, save, reveal.
    const row1 = el('div', 'row link-row');
    const field = el('div', 'field');
    this.input.type = 'text';
    this.input.value = this.state.text;
    this.input.maxLength = MAX_QR_CHARS;
    this.input.placeholder = 'Paste a link or text';
    this.input.spellcheck = false;
    this.input.autocapitalize = 'off';
    this.input.autocomplete = 'off';
    this.input.setAttribute('aria-label', 'Text or URL to encode');
    this.input.addEventListener('input', () => {
      this.state.text = this.input.value;
      this.updateCounter();
      window.clearTimeout(this.debounce);
      this.debounce = window.setTimeout(() => void this.generate(), 450);
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        window.clearTimeout(this.debounce);
        void this.generate();
      }
    });
    field.append(this.input, this.counter);

    this.revealButton.type = 'button';
    this.revealButton.addEventListener('click', () => this.viewer.toggle());

    const saveWrap = el('div', 'save-wrap');
    this.saveButton.type = 'button';
    this.saveButton.innerHTML = `${ICONS.save}<span>Save</span>`;
    this.saveButton.setAttribute('aria-haspopup', 'menu');
    this.saveButton.setAttribute('aria-expanded', 'false');
    this.saveButton.addEventListener('click', () => (this.saveMenu.hidden ? this.openMenu() : this.closeMenu()));
    this.saveMenu.hidden = true;
    this.saveMenu.setAttribute('role', 'menu');
    const items: [string, string, () => void][] = [
      ['Full-screen scan', 'Big and flat, easiest to scan', () => void this.openScanOverlay()],
      ['Copy embed code', 'Iframe for any website', () => void this.copyEmbed()],
      ['Scan image', 'PNG, flat QR', () => void this.save('scan')],
      ['Model image', 'PNG, 3D view', () => void this.save('object')],
      ['Print-ready SVG', 'Black and white vector', () => this.saveSvg()],
    ];
    for (const [title, detail, action] of items) {
      const item = el('button', 'menu-item');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.append(el('span', 'menu-title', title), el('span', 'menu-detail', detail));
      item.addEventListener('click', () => {
        this.closeMenu();
        action();
      });
      this.saveMenu.append(item);
    }
    saveWrap.append(this.saveButton, this.saveMenu);
    row1.append(field, saveWrap, this.revealButton);

    // Row 2: object, color, time of day.
    const row2 = el('div', 'row options-row');
    const objects = el('div', 'pills');
    objects.setAttribute('role', 'radiogroup');
    objects.setAttribute('aria-label', 'Object');
    for (const object of OBJECTS) {
      const label = el('label', 'pill');
      const radio = el('input', 'sr-only');
      radio.type = 'radio';
      radio.name = 'object';
      radio.value = object.id;
      radio.checked = object.id === this.state.objectId;
      radio.addEventListener('change', () => this.chooseObject(object));
      this.objectInputs.set(object.id, radio);
      label.append(radio, el('span', 'pill-label', object.name));
      objects.append(label);
    }
    const photoPill = el('label', 'pill');
    const photoRadio = el('input', 'sr-only');
    photoRadio.type = 'radio';
    photoRadio.name = 'object';
    photoRadio.value = PHOTO_ID;
    photoRadio.addEventListener('change', () => this.choosePhoto());
    this.objectInputs.set(PHOTO_ID, photoRadio);
    const photoLabel = el('span', 'pill-label');
    photoLabel.innerHTML = `${ICONS.photo}<span>Your photo</span>`;
    photoPill.append(photoRadio, photoLabel);
    objects.append(photoPill);

    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.hidden = true;
    this.fileInput.setAttribute('aria-label', 'Choose a photo');
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.loadPhoto(file);
    });
    this.fileInput.addEventListener('cancel', () => this.restoreObjectRadio());
    this.buildPhotoRow();

    this.variantRow.setAttribute('role', 'radiogroup');
    this.variantRow.setAttribute('aria-label', 'Color');
    this.renderVariants();

    const times = el('div', 'segmented');
    times.setAttribute('role', 'radiogroup');
    times.setAttribute('aria-label', 'Time of day');
    for (const time of TIMES_OF_DAY) {
      const label = el('label', 'segment');
      label.title = TIME_LABELS[time];
      const radio = el('input', 'sr-only');
      radio.type = 'radio';
      radio.name = 'time';
      radio.value = time;
      radio.checked = time === this.state.time;
      radio.addEventListener('change', () => this.chooseTime(time));
      this.timeInputs.set(time, radio);
      const icon = el('span', 'segment-icon');
      icon.innerHTML = ICONS[time];
      label.append(radio, icon, el('span', 'segment-text', TIME_LABELS[time]));
      times.append(label);
    }
    row2.append(objects, this.variantRow, this.photoRow, times, this.fileInput);

    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    dock.append(row1, row2, this.status);

    this.loading.setAttribute('role', 'status');
    this.loading.append(el('span', 'spinner'), this.loadingText);
    this.loading.hidden = true;
    this.updateCounter();
    return dock;
  }

  private buildInfo(): HTMLElement {
    const dialog = el('dialog', 'info');
    dialog.setAttribute('aria-labelledby', 'info-title');
    const head = el('div', 'info-head');
    const title = el('h2', '', 'How Voxel QR works');
    title.id = 'info-title';
    const close = el('button', 'icon-btn');
    close.type = 'button';
    close.innerHTML = ICONS.close;
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => dialog.close());
    head.append(title, close);

    const steps = el('ol', 'info-steps');
    const copy: [string, string][] = [
      ['Paste a link', `Anything up to ${MAX_QR_CHARS} characters. The code uses the highest error correction.`],
      ['Meet your model', 'Pick an object, color and time of day. The code is laid into the ground tiles and grows through the model\'s surfaces.'],
      ['Tap to reveal', 'The camera lifts overhead, the lighting flattens and the model\'s own colors resolve into the code. Scan it straight off the screen.'],
      ['Or use your own photo', 'Choose Your photo (or drop an image anywhere). It becomes an embossed 3D relief whose colors resolve into a scannable code, tuned automatically so it still reads.'],
      ['Check and share', 'We decode the rendered image in your browser and show a verified badge. Save a PNG or a print-ready SVG, or copy a share link.'],
    ];
    for (const [heading, body] of copy) {
      const item = el('li');
      item.append(el('strong', '', heading), el('span', '', body));
      steps.append(item);
    }
    const privacy = el('p', 'info-note', 'Everything runs in your browser. Your text and photos are never uploaded, and there is no account or tracking. For the easiest scan, open Save → Full-screen scan. The first photo downloads a small depth model (about 27 MB) once and keeps it in your browser.');
    const keys = el('p', 'info-note', 'Shortcuts: Space or R reveals, T changes the time of day, arrow keys rotate.');
    dialog.append(head, steps, privacy, keys);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    return dialog;
  }

  // ---------- Photo mode ----------

  private buildPhotoRow(): void {
    this.photoRow.hidden = true;
    const change = el('button', 'btn ghost small');
    change.type = 'button';
    change.innerHTML = `${ICONS.upload}<span>Change photo</span>`;
    change.addEventListener('click', () => this.fileInput.click());

    const looks = el('div', 'segmented');
    looks.setAttribute('role', 'radiogroup');
    looks.setAttribute('aria-label', 'Scan strength');
    for (const [value, text, description] of LOOK_LABELS) {
      const label = el('label', 'segment');
      label.title = description;
      const radio = el('input', 'sr-only');
      radio.type = 'radio';
      radio.name = 'look';
      radio.value = value;
      radio.checked = value === this.look;
      radio.addEventListener('change', () => {
        this.look = value;
        if (this.state.objectId === PHOTO_ID) void this.generate();
      });
      this.lookInputs.set(value, radio);
      label.append(radio, el('span', 'look-text', text));
      looks.append(label);
    }
    this.photoRow.append(change, this.photoName, looks);
  }

  private attachDrop(): void {
    let depth = 0;
    const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    window.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth++;
      this.root.classList.add('dragging-file');
    });
    window.addEventListener('dragover', (event) => {
      if (hasFiles(event)) event.preventDefault();
    });
    window.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) this.root.classList.remove('dragging-file');
    });
    window.addEventListener('drop', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      this.root.classList.remove('dragging-file');
      const file = event.dataTransfer?.files?.[0];
      if (file) void this.loadPhoto(file);
    });
  }

  private choosePhoto(): void {
    if (this.viewer.rendererKind === 'canvas') {
      this.showToast('Photos need WebGL 2, which this device does not support');
      this.restoreObjectRadio();
      return;
    }
    if (this.photo.ready) {
      this.enterPhotoMode();
      void this.generate();
      return;
    }
    this.fileInput.click();
  }

  /** The user dismissed the file dialog: put the selection back on the object that is showing. */
  private restoreObjectRadio(): void {
    const radio = this.objectInputs.get(this.state.objectId);
    if (radio) radio.checked = true;
  }

  private async loadPhoto(file: File): Promise<void> {
    if (this.viewer.rendererKind === 'canvas') {
      this.showToast('Photos need WebGL 2, which this device does not support');
      return;
    }
    this.showLoading('Reading your photo…');
    await nextPaint();
    try {
      await this.photo.load(file);
    } catch (error) {
      this.loading.hidden = true;
      this.showToast(error instanceof PhotoReadError ? error.message : 'Could not read that image');
      this.restoreObjectRadio();
      return;
    }
    this.photoName.textContent = file.name;
    this.photoName.title = file.name;
    this.enterPhotoMode();
    await this.generate();
  }

  private enterPhotoMode(): void {
    this.state.objectId = PHOTO_ID;
    const radio = this.objectInputs.get(PHOTO_ID);
    if (radio) radio.checked = true;
    this.variantRow.hidden = true;
    this.photoRow.hidden = false;
    this.viewer.setRestingView(0.95, 0.12);
  }

  private leavePhotoMode(): void {
    if (this.state.objectId !== PHOTO_ID) return;
    this.photoRow.hidden = true;
    this.variantRow.hidden = false;
    this.viewer.setRestingView(IDLE_ELEVATION, Math.PI / 4);
  }

  private showLoading(message: string): void {
    this.loadingText.textContent = message;
    this.loading.hidden = false;
  }

  /** Photo codes are built from a different pipeline; give SVG export the matrix in the shape it expects. */
  private photoQrData(code: { qr: { matrix: Uint8Array }; modules: number; version: number; text: string }): QRData {
    const matrix: boolean[][] = [];
    for (let r = 0; r < code.modules; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < code.modules; c++) row.push(code.qr.matrix[r * code.modules + c] === 1);
      matrix.push(row);
    }
    return { matrix, size: code.modules, content: code.text, version: code.version };
  }

  private async generatePhoto(ticket: number): Promise<void> {
    const text = this.state.text.trim();
    if (!text) {
      this.setStatus('Enter some text or a URL first.', true);
      this.setVerify('idle');
      return;
    }
    if (!this.photo.ready) {
      this.setStatus('Choose a photo to continue.');
      return;
    }
    this.setStatus('');
    this.setVerify('checking');
    this.showLoading('Reading your photo…');
    await nextPaint();

    try {
      const pipeline = await import('../photo/pipeline');
      const depth = await this.photo.depthFor(pipeline.estimateDepth, (message) => this.showLoading(message));
      if (ticket !== this.generation) return;
      this.showLoading('Encoding your QR code…');
      await nextPaint();
      const code = pipeline.prepareCode(text, this.photo.square!, depth.depth);
      if (ticket !== this.generation) return;

      let start = pipeline.LOOK_ORDER.indexOf(this.look === 'auto' ? 'soft' : this.look);
      if (this.look === 'auto') {
        this.showLoading('Tuning the scan…');
        await nextPaint();
        const choice = await pipeline.chooseLook(code.photo, code.modules, code.moduleVoxels, code.qr.matrix, text, pipeline.decodeWithZXing);
        start = pipeline.LOOK_ORDER.indexOf(choice.look);
        if (ticket !== this.generation) return;
      }

      // Build, then check the real rendered scan view; if a phone-like decoder cannot read it, firm it up.
      let verified = false;
      let used = pipeline.LOOK_ORDER[start];
      for (let i = start; i < pipeline.LOOK_ORDER.length; i++) {
        used = pipeline.LOOK_ORDER[i];
        this.showLoading('Sculpting the 3D relief…');
        await nextPaint();
        const model = pipeline.buildPhotoModel(code, used);
        const mesh = buildMesh(model, { allPlot: true, soften: 0.82, shadows: false });
        if (ticket !== this.generation) return;
        this.viewer.setMesh(mesh);
        this.qr = this.photoQrData(code);
        await nextPaint();
        if (ticket !== this.generation) return;
        const image = this.viewer.renderScanImage(900);
        const decoded = image ? await pipeline.decodeWithZXing({ data: image.data, width: image.width, height: image.height }) : null;
        verified = decoded === text;
        if (verified || this.look !== 'auto') break;
      }
      if (ticket !== this.generation) return;
      this.setVerify(verified ? 'ok' : 'fail');
      const source = depth.source === 'model' ? 'AI depth' : 'built-in relief';
      const strength = LOOK_LABELS.find(([value]) => value === used)?.[1] ?? used;
      this.setStatus(`Your photo · ${source} · ${strength}${depth.source === 'heuristic' ? ' (depth model unavailable, using a simpler relief)' : ''}`);
      this.syncUrl();
    } catch (error) {
      console.error(error);
      const { PhotoError } = await import('../photo/pipeline');
      this.setStatus(error instanceof PhotoError ? error.message : 'Could not build the photo model. Try another photo.', true);
      this.setVerify('fail');
    } finally {
      if (ticket === this.generation) this.loading.hidden = true;
    }
  }

  // ---------- State changes ----------

  private chooseObject(object: VoxelObject): void {
    this.leavePhotoMode();
    this.state.objectId = object.id;
    this.state.variantId = object.variants[0].id;
    this.regular = { objectId: object.id, variantId: object.variants[0].id };
    this.renderVariants();
    void this.generate();
  }

  private chooseTime(time: TimeOfDay): void {
    this.state.time = time;
    this.viewer.setTimeOfDay(time);
    this.applyTime();
    this.syncUrl();
  }

  private renderVariants(): void {
    const object = getObject(this.state.objectId);
    this.variantRow.replaceChildren();
    for (const variant of object.variants) {
      const label = el('label', 'swatch');
      label.title = variant.name;
      const radio = el('input', 'sr-only');
      radio.type = 'radio';
      radio.name = 'variant';
      radio.value = variant.id;
      radio.checked = variant.id === this.state.variantId;
      radio.setAttribute('aria-label', variant.name);
      radio.addEventListener('change', () => {
        this.state.variantId = variant.id;
        this.regular.variantId = variant.id;
        void this.generate();
      });
      const dot = el('span', 'swatch-dot');
      dot.style.background = variant.color;
      label.append(radio, dot);
      this.variantRow.append(label);
    }
  }

  private applyTime(): void {
    const time = this.state.time;
    this.root.dataset.time = time;
    this.root.dataset.tone = LIGHTING[time].tone;
    for (const layer of this.root.querySelectorAll<HTMLElement>('.sky-layer')) layer.classList.toggle('active', layer.dataset.time === time);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', LIGHTING[time].tone === 'dark' ? '#0b0f18' : '#e9eff7');
    const radio = this.timeInputs.get(time);
    if (radio) radio.checked = true;
  }

  private onViewer(state: ViewerState): void {
    const scanning = state.mode === 'scan';
    this.revealButton.innerHTML = `${scanning ? ICONS.cube : ICONS.reveal}<span>${scanning ? 'Show model' : 'Reveal QR'}</span>`;
    this.revealButton.setAttribute('aria-pressed', String(scanning));
    this.hint.textContent = state.renderer === 'canvas' && !scanning
      ? 'Compatibility mode · tap the model to reveal the QR'
      : scanning ? (this.state.objectId === PHOTO_ID ? 'Easiest to scan: Save → Full-screen scan · tap to bring the model back' : 'Scan with your phone camera · tap to bring the model back') : 'Drag to rotate · tap the model to reveal the QR';
    this.root.dataset.mode = state.mode;
    if (this.embed) {
      this.embedButton.innerHTML = this.revealButton.innerHTML;
      if (scanning) this.embedHint.classList.add('hidden');
      this.postEmbed('state', state.mode, state.busy);
    }
  }

  private syncInsets(): void {
    const dockHeight = this.dock.offsetHeight;
    const compact = window.innerWidth < 640;
    if (this.embed) {
      // Leave room for the button (and the hint above it) so the model never sits under them.
      const bottom = (this.embed.controls ? 58 : 0) + (this.embed.hint ? 38 : 0);
      this.viewer?.setInsets({ top: 0, bottom });
      return;
    }
    this.viewer?.setInsets({ top: compact ? 64 : 72, bottom: dockHeight + (compact ? 64 : 76) });
    this.root.style.setProperty('--dock-height', `${dockHeight}px`);
  }

  private updateCounter(): void {
    this.counter.textContent = `${this.input.value.length}/${MAX_QR_CHARS}`;
  }

  private setVerify(state: VerifyState): void {
    this.verify.dataset.state = state;
    this.verifyText.textContent = {
      idle: '',
      checking: 'Checking scan…',
      ok: 'Verified scannable',
      fail: 'Could not verify this scan',
    }[state];
  }

  private setStatus(message: string, isError = false): void {
    this.status.textContent = message;
    this.status.classList.toggle('error', isError);
  }

  private syncUrl(): void {
    if (this.embed) return;
    try {
      const shared = this.state.objectId === PHOTO_ID ? { ...this.state, ...this.regular } : this.state;
      window.history.replaceState(null, '', `?${writeQuery(shared)}`);
    } catch {
      /* history unavailable in some embeds */
    }
  }

  // ---------- Generate, verify, export ----------

  private async generate(): Promise<void> {
    window.clearTimeout(this.debounce);
    const ticket = ++this.generation;
    if (this.state.objectId === PHOTO_ID) {
      await this.generatePhoto(ticket);
      return;
    }
    this.loadingText.textContent = 'Building your model…';
    let qr: QRData;
    try {
      qr = generateQRMatrix(this.state.text);
    } catch (error) {
      this.setStatus(error instanceof QRInputError ? error.message : 'Could not create that QR code. Try different text.', true);
      this.setVerify('idle');
      return;
    }
    this.setStatus('');
    this.setVerify('checking');
    this.loading.hidden = false;
    await nextPaint();
    if (ticket !== this.generation) return;

    try {
      const model = buildModel(qr, {
        objectId: this.state.objectId,
        variantId: this.state.variantId,
        compat: this.viewer.rendererKind === 'canvas',
      });
      const mesh = buildMesh(model);
      if (ticket !== this.generation) return;
      this.qr = qr;
      this.viewer.setMesh(mesh);
      if (this.embed) {
        // Embeds skip the scan check and the URL rewrite: they only show the model.
        if (this.embed.view === 'scan' && !this.embedStarted) this.viewer.setMode('scan');
        this.embedStarted = true;
        return;
      }
      this.syncUrl();
      await nextPaint();
      if (ticket !== this.generation) return;

      const image = this.viewer.renderScanImage(640);
      const decoded = image ? decodeImage(image) : null;
      this.setVerify(decoded === qr.content ? 'ok' : 'fail');
      if (decoded !== qr.content) console.warn('Scan verification mismatch', { expected: qr.content, decoded });
    } catch (error) {
      console.error(error);
      this.setStatus('Could not build the model on this device. Try shorter text.', true);
      this.setVerify('fail');
    } finally {
      if (ticket === this.generation) this.loading.hidden = true;
    }
  }

  private async save(kind: 'scan' | 'object'): Promise<void> {
    try {
      const blob = await this.viewer.exportImage(kind);
      download(blob, kind === 'scan' ? 'voxel-qr-scan.png' : `voxel-qr-${this.state.objectId}.png`);
      this.showToast('Image saved');
    } catch (error) {
      console.error(error);
      this.showToast('Could not create the image');
    }
  }

  private buildScanOverlay(): HTMLElement {
    this.scanOverlay.hidden = true;
    this.scanOverlay.setAttribute('role', 'dialog');
    this.scanOverlay.setAttribute('aria-label', 'Full-screen scan');
    this.scanImage.alt = 'QR code to scan';
    const caption = el('p', 'scan-caption', 'Point your phone camera at the code. Tap anywhere or press Esc to close.');
    this.scanOverlay.append(this.scanImage, caption);
    this.scanOverlay.addEventListener('click', () => this.closeScanOverlay());
    return this.scanOverlay;
  }

  /** Show the flat code as large as the screen allows: bigger modules are what phones read most reliably. */
  private async openScanOverlay(): Promise<void> {
    try {
      const blob = await this.viewer.exportImage('scan');
      if (this.scanUrl) URL.revokeObjectURL(this.scanUrl);
      this.scanUrl = URL.createObjectURL(blob);
      this.scanImage.src = this.scanUrl;
      this.scanOverlay.hidden = false;
    } catch (error) {
      console.error(error);
      this.showToast('Could not open the scan view');
    }
  }

  private closeScanOverlay(): void {
    this.scanOverlay.hidden = true;
  }

  // ---------- Embedding ----------

  private buildEmbedControls(): HTMLElement {
    this.embedBar.hidden = !this.embed;
    if (!this.embed) return this.embedBar;
    this.embedButton.type = 'button';
    this.embedButton.addEventListener('click', () => this.viewer.toggle());
    this.embedHint.hidden = !this.embed.hint;
    this.embedButton.hidden = !this.embed.controls;
    this.embedBar.append(this.embedHint, this.embedButton);
    return this.embedBar;
  }

  private startEmbed(options: EmbedOptions): void {
    this.viewer.setAutoRotate(options.rotate);
    this.stage.addEventListener('pointerdown', () => this.embedHint.classList.add('hidden'), { once: true });
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const command = parseCommand(event.data);
      if (command === 'reveal') this.viewer.setMode('scan');
      else if (command === 'hide') this.viewer.setMode('object');
      else if (command === 'toggle') this.viewer.toggle();
    });
    this.postEmbed('ready', 'object', false);
  }

  /** Tell the page that contains the iframe what the viewer is doing. */
  private postEmbed(type: EmbedEvent['type'], mode: EmbedEvent['mode'], busy: boolean): void {
    if (!this.embed || window.parent === window) return;
    const message: EmbedEvent = { source: 'voxel-qr', type, mode, busy };
    window.parent.postMessage(message, '*');
  }

  private async copyEmbed(): Promise<void> {
    if (this.state.objectId === PHOTO_ID) {
      this.showToast('Photos cannot be embedded yet');
      return;
    }
    const src = embedUrl(window.location.href, this.state);
    const html = embedSnippet(src);
    this.showToast((await copyText(html)) ? 'Embed code copied' : 'Could not copy. Allow clipboard access and try again');
  }

  private saveSvg(): void {
    if (!this.qr) return;
    download(new Blob([qrToSvg(this.qr)], { type: 'image/svg+xml' }), 'voxel-qr.svg');
    this.showToast('SVG saved');
  }

  private async share(): Promise<void> {
    this.syncUrl();
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      this.showToast(this.state.objectId === PHOTO_ID ? 'Link copied (photos are not included)' : 'Share link copied');
    } catch {
      this.showToast('Copy the link from your address bar');
    }
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2200);
  }

  private openMenu(): void {
    this.saveMenu.hidden = false;
    this.saveButton.setAttribute('aria-expanded', 'true');
  }

  private closeMenu(): void {
    this.saveMenu.hidden = true;
    this.saveButton.setAttribute('aria-expanded', 'false');
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeMenu();
      this.closeScanOverlay();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'r' || event.key === 'R' || (event.key === ' ' && target.tagName !== 'BUTTON' && target.tagName !== 'LABEL')) {
      event.preventDefault();
      this.viewer.toggle();
    } else if (event.key === 't' || event.key === 'T') {
      const next = TIMES_OF_DAY[(TIMES_OF_DAY.indexOf(this.state.time) + 1) % TIMES_OF_DAY.length];
      this.chooseTime(next);
    }
  }
}
