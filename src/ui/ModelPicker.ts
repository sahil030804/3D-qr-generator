import { DOMAINS, OBJECTS, OBJECT_SUBCATEGORY_MAP, getObject, getObjectsByCategory, type DomainCategory, type VoxelObject } from '../objects';
import { ICONS } from './icons';

const stroke = (body: string, size = 18): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** One line icon per domain, drawn in the same style as the rest of the UI icons. */
const DOMAIN_ICONS: Record<string, string> = {
  medical: stroke('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8v8M8 12h8"/>'),
  food: stroke('<path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9M17 21V3c-2 1-3.2 3-3.2 6v4H17"/>'),
  tech: stroke('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  vehicles: stroke('<path d="M4 16v-4l2.2-5h11.6l2.2 5v4zM4 12h16"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/>'),
  education: stroke('<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c3 2.2 8 2.2 11 0V11M21.5 9v5"/>'),
  nature: stroke('<path d="M5 19C5 10 11 5 20 5c0 9-5.5 14-14 14"/><path d="M5 19l8-8"/>'),
  business: stroke('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  sports: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 3a14 14 0 0 0 0 18M3 12h18M5.6 5.8c3.4 2 9.4 2 12.8 0M5.6 18.2c3.4-2 9.4-2 12.8 0"/>'),
  arts: stroke('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9s-.9-1.5-.9-2.5.9-1.6 2-1.6H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  architecture: stroke('<path d="M4 21V8.5L12 3l8 5.5V21M9.5 21v-6h5v6M2.5 21h19"/>'),
  science: stroke('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.4 15h9.2"/>'),
  lifestyle: stroke('<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>'),
};
const SEARCH_ICON = stroke('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', 16);

/**
 * A small isometric voxel cube in a model's main color: top face lit, left in its natural color, right in shade.
 * It echoes the app logo and each model's palette, so every card is recognizable at a glance.
 */
function voxelThumb(color: string, size: number): string {
  const top = `color-mix(in srgb, ${color} 72%, white)`;
  const right = `color-mix(in srgb, ${color} 70%, black)`;
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <path d="M16 4 27 10 16 16 5 10z" style="fill:${top}"/>
    <path d="M5 10 16 16v12L5 22z" style="fill:${color}"/>
    <path d="M27 10 16 16v12l11-6z" style="fill:${right}"/>
    <path d="M16 4 27 10v12L16 28 5 22V10z" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".8" stroke-linejoin="round"/>
  </svg>`;
}

/** The most colorful of a model's variants, so white or grey defaults still give a recognizable thumbnail. */
function thumbColor(object: VoxelObject): string {
  let best = object.variants[0].color;
  let bestScore = -1;
  for (const { color } of object.variants) {
    const v = parseInt(color.slice(1), 16);
    const r = (v >> 16) & 255;
    const g = (v >> 8) & 255;
    const b = v & 255;
    const score = Math.max(r, g, b) - Math.min(r, g, b);
    if (score > bestScore) {
      best = color;
      bestScore = score;
    }
  }
  return best;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

interface Location {
  domain: DomainCategory;
  subName: string;
}

/** Where a model sits in the taxonomy, for labels and search. */
function locate(object: VoxelObject): Location {
  const subId = OBJECT_SUBCATEGORY_MAP[object.id];
  for (const domain of DOMAINS) {
    const sub = domain.subcategories.find((s) => s.id === subId);
    if (sub) return { domain, subName: sub.name };
  }
  const domain = DOMAINS.find((d) => d.id === object.category) ?? DOMAINS[0];
  return { domain, subName: domain.name };
}

const modelCount = (domain: DomainCategory): number =>
  domain.subcategories.reduce((sum, sub) => sum + getObjectsByCategory(sub.id).length, 0);

/**
 * The design browser that replaces the category and model dropdowns: a trigger showing the current design, and a
 * panel with the domains in a rail, search, and model cards grouped by subcategory.
 */
export class ModelPicker {
  readonly trigger = node('button', 'design-trigger');
  readonly panel = node('div', 'design-panel');
  private readonly triggerThumb = node('span', 'design-trigger-thumb');
  private readonly triggerName = node('span', 'design-trigger-name');
  private readonly triggerMeta = node('span', 'design-trigger-meta');
  private readonly rail = node('nav', 'design-rail');
  private readonly content = node('div', 'design-content');
  private readonly search = node('input', 'design-search-input');
  private readonly heading = node('h2', 'design-title');
  private readonly countLabel = node('span', 'design-count');
  private currentId = OBJECTS[0].id;
  private domainId = DOMAINS[0].id;

  constructor(private readonly onChoose: (object: VoxelObject) => void) {
    this.trigger.type = 'button';
    this.trigger.setAttribute('aria-haspopup', 'dialog');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-controls', 'design-panel');
    const text = node('span', 'design-trigger-text');
    text.append(this.triggerName, this.triggerMeta);
    const chevron = node('span', 'design-trigger-chevron');
    chevron.innerHTML = ICONS.chevron;
    this.trigger.append(this.triggerThumb, text, chevron);
    this.trigger.addEventListener('click', () => (this.isOpen ? this.close(true) : this.open()));

    this.panel.id = 'design-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Choose a design');
    this.buildPanel();

    document.addEventListener('pointerdown', (event) => {
      if (!this.isOpen) return;
      const target = event.target as Node;
      if (!this.panel.contains(target) && !this.trigger.contains(target)) this.close(false);
    });
    this.panel.addEventListener('keydown', (event) => this.onKey(event));
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  setDisabled(disabled: boolean): void {
    this.trigger.disabled = disabled;
    if (disabled) this.close(false);
  }

  /** Show which design is active, on the trigger and in the panel. */
  setCurrent(objectId: string): void {
    this.currentId = objectId;
    const object = getObject(objectId);
    const { domain, subName } = locate(object);
    this.triggerThumb.innerHTML = voxelThumb(thumbColor(object), 30);
    this.triggerName.textContent = object.name;
    this.triggerMeta.textContent = `${domain.name.split(' & ')[0]} · ${subName}`;
    this.trigger.setAttribute('aria-label', `Design: ${object.name}, ${subName}. Change design`);
    if (this.isOpen) this.render();
  }

  open(): void {
    if (this.trigger.disabled) return;
    this.domainId = locate(getObject(this.currentId)).domain.id;
    this.search.value = '';
    this.render();
    this.panel.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    // Typing straight away is handy with a keyboard; on touch screens it would only pop up the keyboard.
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    requestAnimationFrame(() => {
      const selected = this.content.querySelector<HTMLElement>('.design-card[aria-pressed="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
      if (touch) selected?.focus({ preventScroll: true });
      else this.search.focus();
    });
  }

  close(restoreFocus: boolean): void {
    if (!this.isOpen) return;
    this.panel.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.trigger.focus();
  }

  private buildPanel(): void {
    const head = node('div', 'design-head');
    const titles = node('div', 'design-titles');
    this.heading.textContent = 'Choose a design';
    this.countLabel.textContent = `${OBJECTS.length} designs`;
    titles.append(this.heading, this.countLabel);
    const searchWrap = node('label', 'design-search');
    const icon = node('span', 'design-search-icon');
    icon.innerHTML = SEARCH_ICON;
    this.search.type = 'search';
    this.search.placeholder = 'Search designs';
    this.search.setAttribute('aria-label', 'Search designs');
    this.search.autocomplete = 'off';
    this.search.spellcheck = false;
    this.search.addEventListener('input', () => this.render());
    searchWrap.append(icon, this.search);
    const close = node('button', 'design-close');
    close.type = 'button';
    close.innerHTML = ICONS.close;
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.close(true));
    head.append(titles, searchWrap, close);

    this.rail.setAttribute('aria-label', 'Categories');
    const body = node('div', 'design-body');
    body.append(this.rail, this.content);
    this.panel.append(head, body);
  }

  private render(): void {
    const query = this.search.value.trim().toLowerCase();
    this.renderRail(query !== '');
    this.content.replaceChildren();
    this.content.scrollTop = 0;
    if (query) this.renderSearch(query);
    else this.renderDomain(DOMAINS.find((d) => d.id === this.domainId) ?? DOMAINS[0]);
  }

  private renderRail(searching: boolean): void {
    this.rail.replaceChildren();
    this.rail.classList.toggle('searching', searching);
    for (const domain of DOMAINS) {
      const count = modelCount(domain);
      const item = node('button', 'design-rail-item');
      item.type = 'button';
      item.dataset.domain = domain.id;
      if (!searching && domain.id === this.domainId) item.setAttribute('aria-current', 'true');
      const icon = node('span', 'design-rail-icon');
      icon.innerHTML = DOMAIN_ICONS[domain.id] ?? ICONS.cube;
      const badge = node('span', count ? 'design-rail-count' : 'design-rail-soon', count ? String(count) : 'Soon');
      item.append(icon, node('span', 'design-rail-name', domain.name.split(' & ')[0]), badge);
      item.title = domain.blurb;
      item.addEventListener('click', () => {
        this.search.value = '';
        this.domainId = domain.id;
        this.render();
        this.rail.querySelector<HTMLElement>(`[data-domain="${domain.id}"]`)?.focus();
      });
      this.rail.append(item);
    }
  }

  private renderDomain(domain: DomainCategory): void {
    const intro = node('div', 'design-domain');
    intro.append(node('h3', 'design-domain-name', domain.name), node('p', 'design-domain-blurb', domain.blurb));
    this.content.append(intro);
    const soon: string[] = [];
    for (const sub of domain.subcategories) {
      const models = getObjectsByCategory(sub.id);
      if (!models.length) {
        soon.push(sub.name);
        continue;
      }
      this.content.append(this.group(sub.name, models, false));
    }
    if (soon.length) {
      const block = node('div', 'design-soon');
      block.append(node('span', 'design-soon-label', 'Coming soon'));
      const chips = node('div', 'design-soon-chips');
      for (const name of soon) chips.append(node('span', 'design-chip', name));
      block.append(chips);
      this.content.append(block);
    }
  }

  private renderSearch(query: string): void {
    // Every typed word must start a word in the text, so "car" finds Car but not "healthcare". Names and
    // categories come first; descriptions are searched only when nothing else matches.
    const terms = query.split(/\s+/).filter(Boolean);
    const hits = (text: string): boolean => {
      const words = text.toLowerCase().split(/[^a-z0-9]+/);
      return terms.every((term) => words.some((word) => word.startsWith(term)));
    };
    const byName = OBJECTS.filter((object) => {
      const { domain, subName } = locate(object);
      return hits(`${object.name} ${subName} ${domain.name}`);
    });
    const matches = byName.length ? byName : OBJECTS.filter((object) => hits(object.description));
    if (!matches.length) {
      const empty = node('div', 'design-empty');
      empty.append(node('strong', '', 'No designs found'), node('span', '', 'Try a category like “medical” or “food”.'));
      this.content.append(empty);
      return;
    }
    for (const domain of DOMAINS) {
      const inDomain = matches.filter((object) => locate(object).domain.id === domain.id);
      if (inDomain.length) this.content.append(this.group(domain.name, inDomain, true));
    }
  }

  /** A titled grid of cards; `showPlace` labels each card with its subcategory (search results mix them). */
  private group(title: string, models: VoxelObject[], showPlace: boolean): HTMLElement {
    const section = node('section', 'design-group');
    section.append(node('h4', 'design-group-title', title));
    const grid = node('div', 'design-grid');
    for (const object of models) grid.append(this.card(object, showPlace));
    section.append(grid);
    return section;
  }

  private card(object: VoxelObject, showPlace: boolean): HTMLElement {
    const selected = object.id === this.currentId;
    const card = node('button', 'design-card');
    card.type = 'button';
    card.setAttribute('aria-pressed', String(selected));
    card.title = object.description;
    const thumb = node('span', 'design-card-thumb');
    const tint = thumbColor(object);
    thumb.style.setProperty('--tint', tint);
    thumb.innerHTML = voxelThumb(tint, 34);
    const dots = node('span', 'design-card-dots');
    for (const variant of object.variants) {
      const dot = node('span', 'design-card-dot');
      dot.style.background = variant.color;
      dots.append(dot);
    }
    const text = node('span', 'design-card-text');
    text.append(node('span', 'design-card-name', object.name));
    if (showPlace) text.append(node('span', 'design-card-meta', locate(object).subName));
    text.append(dots);
    card.append(thumb, text);
    if (selected) {
      const check = node('span', 'design-card-check');
      check.innerHTML = ICONS.check;
      card.append(check);
    }
    card.addEventListener('click', () => {
      this.close(true);
      if (object.id !== this.currentId) this.onChoose(object);
    });
    return card;
  }

  /** Escape closes; arrow keys move through the rail and around the card grid. */
  private onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (!active) return;
    if (active === this.search && event.key === 'ArrowDown') {
      event.preventDefault();
      this.content.querySelector<HTMLElement>('.design-card')?.focus();
      return;
    }
    if (active.classList.contains('design-rail-item') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const items = [...this.rail.querySelectorAll<HTMLElement>('.design-rail-item')];
      const next = items[(items.indexOf(active) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      next.focus();
      return;
    }
    if (!active.classList.contains('design-card') || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const cards = [...this.content.querySelectorAll<HTMLElement>('.design-card')];
    const index = cards.indexOf(active);
    if (event.key === 'ArrowRight') cards[Math.min(cards.length - 1, index + 1)]?.focus();
    else if (event.key === 'ArrowLeft') cards[Math.max(0, index - 1)]?.focus();
    else {
      // Up and down: the nearest card in the row above or below.
      const here = active.getBoundingClientRect();
      const down = event.key === 'ArrowDown';
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        const dy = down ? box.top - here.bottom : here.top - box.bottom;
        if (dy < -2) continue;
        const score = dy * 4 + Math.abs(box.left - here.left);
        if (card !== active && score < bestScore) {
          best = card;
          bestScore = score;
        }
      }
      if (best) best.focus();
      else if (!down) this.search.focus();
    }
  }
}
