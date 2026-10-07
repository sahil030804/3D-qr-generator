import { generateQRMatrix, MAX_QR_CHARS, QRInputError, type QRData } from '../core/qr/QRGenerator';
import { qrToSvg } from '../core/qr/qrSvg';
import { getObject, OBJECTS, type VoxelObject } from '../objects';
import { LIGHTING, TIMES_OF_DAY, type TimeOfDay } from '../render/lighting';
import { buildMesh } from '../render/mesher';
import { Viewer, type ViewerState } from '../render/Viewer';
import { buildModel } from '../voxel/buildModel';
import { ICONS, LOGO } from './icons';
import { readState, writeQuery, type AppState } from './state';
import { decodeImage } from './verify';

const DEFAULT_STATE: AppState = { text: 'https://example.com', objectId: OBJECTS[0].id, variantId: OBJECTS[0].variants[0].id, time: 'night' };
const TIME_LABELS: Record<TimeOfDay, string> = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };

type VerifyState = 'idle' | 'checking' | 'ok' | 'fail';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
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
  private readonly objectInputs = new Map<string, HTMLInputElement>();
  private readonly timeInputs = new Map<TimeOfDay, HTMLInputElement>();

  constructor(private readonly root: HTMLElement) {
    this.state = readState(window.location.search, DEFAULT_STATE);
    if (!window.location.search && window.matchMedia?.('(prefers-color-scheme: light)').matches) this.state.time = 'day';
    root.classList.add('app');

    root.append(this.buildSky(), this.stage, this.buildTopbar(), this.hint, this.buildDock(), this.loading, this.toast, this.buildInfo());
    this.viewer = new Viewer(this.stage, (viewerState) => this.onViewer(viewerState));
    this.viewer.setTimeOfDay(this.state.time);
    this.applyTime();

    new ResizeObserver(() => this.syncInsets()).observe(this.dock);
    document.addEventListener('keydown', (event) => this.onKey(event));
    document.addEventListener('click', (event) => {
      if (!this.saveMenu.hidden && !this.saveMenu.contains(event.target as Node) && event.target !== this.saveButton) this.closeMenu();
    });

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
    row2.append(objects, this.variantRow, times);

    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    dock.append(row1, row2, this.status);

    this.loading.setAttribute('role', 'status');
    this.loading.append(el('span', 'spinner'), el('span', '', 'Building your model…'));
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
      ['Check and share', 'We decode the rendered image in your browser and show a verified badge. Save a PNG or a print-ready SVG, or copy a share link.'],
    ];
    for (const [heading, body] of copy) {
      const item = el('li');
      item.append(el('strong', '', heading), el('span', '', body));
      steps.append(item);
    }
    const privacy = el('p', 'info-note', 'Everything runs in your browser. Your text is never uploaded, and there is no account or tracking.');
    const keys = el('p', 'info-note', 'Shortcuts: Space or R reveals, T changes the time of day, arrow keys rotate.');
    dialog.append(head, steps, privacy, keys);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    return dialog;
  }

  // ---------- State changes ----------

  private chooseObject(object: VoxelObject): void {
    this.state.objectId = object.id;
    this.state.variantId = object.variants[0].id;
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
      : scanning ? 'Scan with your phone camera · tap to bring the model back' : 'Drag to rotate · tap the model to reveal the QR';
    this.root.dataset.mode = state.mode;
  }

  private syncInsets(): void {
    const dockHeight = this.dock.offsetHeight;
    const compact = window.innerWidth < 640;
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
    try {
      window.history.replaceState(null, '', `?${writeQuery(this.state)}`);
    } catch {
      /* history unavailable in some embeds */
    }
  }

  // ---------- Generate, verify, export ----------

  private async generate(): Promise<void> {
    window.clearTimeout(this.debounce);
    const ticket = ++this.generation;
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
      this.showToast('Share link copied');
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
