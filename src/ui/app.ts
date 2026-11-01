// The browser console. Renders a View from the engine and turns key presses and clicks into choices.
import type { GameData } from '../engine/schema';
import { applyChoice, buildView } from '../engine/game';
import { creationChoose, creationView, newDraft, newGame, type CreationDraft } from '../engine/creation';
import { newSeed } from '../engine/rng';
import type { GameState, HubTab, Line, Option, View } from '../engine/types';
import { AUTOSAVE, exportSave, pickSaveFile, readSave, slotKey, writeSave } from './saves';

type Mode =
  | { kind: 'title'; message?: string }
  | { kind: 'creation'; draft: CreationDraft }
  | { kind: 'game'; state: GameState; menu: boolean; message?: string };

const TAB_LABELS: Record<HubTab, string> = { comms: 'Comms', nav: 'Nav', ship: 'Ship', logbook: 'Logbook' };
const TAB_ORDER: HubTab[] = ['comms', 'nav', 'ship', 'logbook'];

export class App {
  private mode: Mode = { kind: 'title' };
  private lastScreenKey = '';

  constructor(
    private root: HTMLElement,
    private data: GameData,
  ) {
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.render();
  }

  // ---------- Views for screens outside the engine ----------

  private titleView(message?: string): View {
    const auto = readSave(AUTOSAVE);
    const options: Option[] = [
      { id: 'new', label: 'New captain', tone: 'accent' },
      { id: 'continue', label: 'Continue', detail: auto?.summary, locked: auto ? undefined : 'No autosave yet' },
    ];
    for (let i = 1; i <= this.data.config.SAVE_SLOTS; i++) {
      const s = readSave(slotKey(i));
      options.push({ id: `load:${i}`, label: `Load slot ${i}`, detail: s?.summary, locked: s ? undefined : 'Empty' });
    }
    options.push({ id: 'import', label: 'Import save file', tone: 'muted' });
    return {
      kind: 'title',
      title: 'Votann Command Console',
      subtitle: 'A text adventure on a Kin prospector\'s bridge',
      body: [
        { text: 'The Ashfall Reach. A prospecting fleet. An ancestor vault that should have stayed sealed.' },
        { text: '' },
        {
          text: 'Unofficial fan project. Not affiliated with or endorsed by Games Workshop. Warhammer 40,000, Leagues of Votann, and related names are trademarks of Games Workshop Ltd, used here without permission in a free, non-commercial work.',
          tone: 'muted',
        },
      ],
      options,
      error: message,
    };
  }

  private systemMenuView(state: GameState, message?: string): View {
    const options: Option[] = [{ id: 'sys:resume', label: 'Resume', tone: 'accent' }];
    for (let i = 1; i <= this.data.config.SAVE_SLOTS; i++) {
      const s = readSave(slotKey(i));
      options.push({ id: `sys:save:${i}`, label: `Save to slot ${i}`, detail: s ? `Overwrites: ${s.summary}` : 'Empty' });
    }
    options.push({ id: 'sys:export', label: 'Export save to a file' });
    options.push({ id: 'sys:quit', label: 'Quit to title', detail: 'Your progress is autosaved.', tone: 'muted' });
    return {
      kind: 'system',
      title: 'System',
      subtitle: `${state.character.name}, day ${state.day}`,
      body: message ? [{ text: message, tone: 'good' }] : [{ text: 'The game autosaves after every choice.', tone: 'muted' }],
      options,
    };
  }

  private currentView(): View {
    switch (this.mode.kind) {
      case 'title':
        return this.titleView(this.mode.message);
      case 'creation':
        return creationView(this.data, this.mode.draft);
      case 'game':
        return this.mode.menu ? this.systemMenuView(this.mode.state, this.mode.message) : buildView(this.mode.state, this.data);
    }
  }

  // ---------- Choices ----------

  private choose(id: string, text?: string): void {
    try {
      this.handle(id, text);
    } catch (e) {
      console.error(e);
      if (this.mode.kind === 'game') this.mode.message = `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
    }
    this.render();
  }

  private handle(id: string, text?: string): void {
    const mode = this.mode;
    if (mode.kind === 'title') {
      if (id === 'new') this.mode = { kind: 'creation', draft: newDraft() };
      else if (id === 'continue') this.load(readSave(AUTOSAVE)?.state);
      else if (id.startsWith('load:')) this.load(readSave(slotKey(Number(id.slice(5))))?.state);
      else if (id === 'import')
        pickSaveFile()
          .then((r) => {
            this.load(r.state);
            this.render();
          })
          .catch((e: Error) => {
            this.mode = { kind: 'title', message: e.message };
            this.render();
          });
      return;
    }

    if (mode.kind === 'creation') {
      const { draft, done } = creationChoose(this.data, mode.draft, id, text);
      if (done) {
        const state = newGame(this.data, draft, newSeed());
        writeSave(AUTOSAVE, state, this.data);
        this.mode = { kind: 'game', state, menu: false };
      } else if (id === 'back' && mode.draft.step === 'name') {
        this.mode = { kind: 'title' };
      } else {
        this.mode = { kind: 'creation', draft };
      }
      return;
    }

    mode.message = undefined;
    if (mode.menu) {
      this.systemChoice(mode, id);
      return;
    }
    mode.state = applyChoice(mode.state, this.data, id, text);
    writeSave(AUTOSAVE, mode.state, this.data);
  }

  private systemChoice(mode: Extract<Mode, { kind: 'game' }>, id: string): void {
    if (id === 'sys:resume') mode.menu = false;
    else if (id.startsWith('sys:save:')) {
      const slot = Number(id.slice(9));
      mode.message = writeSave(slotKey(slot), mode.state, this.data) ? `Saved to slot ${slot}.` : 'Saving failed: browser storage is unavailable.';
    } else if (id === 'sys:export') {
      exportSave(mode.state, this.data);
      mode.message = 'Save file exported.';
    } else if (id === 'sys:quit') this.mode = { kind: 'title' };
  }

  private load(state: GameState | undefined): void {
    if (!state) return;
    this.mode = { kind: 'game', state, menu: false };
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Escape' && this.mode.kind === 'game') {
      this.mode.menu = !this.mode.menu;
      this.mode.message = undefined;
      e.preventDefault();
      this.render();
      return;
    }

    const view = this.currentView();
    if (e.key === 'Tab' && view.tabs) {
      e.preventDefault();
      const i = TAB_ORDER.indexOf(view.tabs.active);
      const next = TAB_ORDER[(i + (e.shiftKey ? TAB_ORDER.length - 1 : 1)) % TAB_ORDER.length];
      this.choose(`tab:${next}`);
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      const index = e.key === '0' ? 9 : Number(e.key) - 1;
      const opt = view.options[index];
      if (opt && !opt.locked) {
        e.preventDefault();
        this.choose(opt.id);
      }
    }
  }

  // ---------- Rendering ----------

  private render(): void {
    const view = this.currentView();
    const inGame = this.mode.kind === 'game';
    const state = inGame ? (this.mode as Extract<Mode, { kind: 'game' }>).state : null;

    const root = this.root;
    root.replaceChildren();
    const shell = el('div', 'console');

    const header = el('header', 'console-header');
    const emblem = document.createElement('img');
    emblem.src = '/emblem.svg';
    emblem.alt = '';
    emblem.className = 'emblem';
    header.append(emblem);
    const brand = el('div', 'brand');
    brand.append(el('div', 'brand-title', 'VOTANN COMMAND CONSOLE'));
    brand.append(el('div', 'brand-sub', state ? `${state.ship.name}  //  Captain ${state.character.name}` : 'Durn Prospect Fleet'));
    header.append(brand);
    if (inGame) {
      const sys = el('button', 'system-button', 'System [Esc]');
      sys.addEventListener('click', () => {
        const m = this.mode as Extract<Mode, { kind: 'game' }>;
        m.menu = !m.menu;
        this.render();
      });
      header.append(sys);
    }
    shell.append(header);

    if (view.status?.length) {
      const bar = el('div', 'status-bar');
      for (const s of view.status) {
        const item = el('div', `status-item ${toneClass(s.tone)}`);
        item.append(el('span', 'status-label', s.label), el('span', 'status-value', s.value));
        bar.append(item);
      }
      shell.append(bar);
    }

    if (view.tabs) {
      const tabs = el('nav', 'tabs');
      for (const t of TAB_ORDER) {
        const b = el('button', `tab${view.tabs.active === t ? ' active' : ''}`);
        b.append(document.createTextNode(TAB_LABELS[t]));
        if (t === 'comms' && view.tabs.unread) b.append(el('span', 'badge', String(view.tabs.unread)));
        b.addEventListener('click', () => this.choose(`tab:${t}`));
        tabs.append(b);
      }
      tabs.append(el('span', 'tab-hint', 'Tab: switch screens'));
      shell.append(tabs);
    }

    const screen = el('main', `screen screen--${view.kind}`);
    const head = el('div', 'screen-head');
    head.append(el('h1', 'screen-title', view.title));
    if (view.subtitle) head.append(el('div', 'screen-subtitle', view.subtitle));
    screen.append(head);

    const body = el('div', 'screen-body');
    for (const line of view.body) body.append(renderLine(line));
    screen.append(body);

    // The System menu shows its own messages in the body.
    const gameMode = inGame ? (this.mode as Extract<Mode, { kind: 'game' }>) : null;
    const message = gameMode && !gameMode.menu ? gameMode.message : undefined;
    if (view.error || message) screen.append(el('div', 'screen-error', view.error ?? message ?? ''));

    if (view.input) screen.append(this.renderInput(view.input));
    screen.append(this.renderOptions(view.options));
    shell.append(screen);
    root.append(shell);

    const key = `${view.kind}|${view.title}`;
    if (key !== this.lastScreenKey) window.scrollTo(0, 0);
    this.lastScreenKey = key;
    root.querySelector<HTMLInputElement>('input.text-input')?.focus();
  }

  private renderInput(input: NonNullable<View['input']>): HTMLElement {
    const form = el('form', 'text-form');
    const label = el('label', 'text-label', input.prompt);
    const field = document.createElement('input');
    field.className = 'text-input';
    field.maxLength = input.maxLength;
    field.value = input.value ?? '';
    field.autocomplete = 'off';
    field.spellcheck = false;
    label.append(field);
    const submit = el('button', 'text-submit', 'Confirm [Enter]');
    submit.setAttribute('type', 'submit');
    form.append(label, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.choose(input.id, field.value);
    });
    return form;
  }

  private renderOptions(options: Option[]): HTMLElement {
    const list = el('ol', 'options');
    options.forEach((opt, i) => {
      const li = el('li');
      const b = el('button', `option ${toneClass(opt.tone)}${opt.locked ? ' locked' : ''}`) as HTMLButtonElement;
      b.disabled = !!opt.locked;
      const key = i < 9 ? String(i + 1) : i === 9 ? '0' : '';
      b.append(el('span', 'option-key', key));
      const text = el('span', 'option-text');
      text.append(el('span', 'option-label', opt.label));
      if (opt.detail) text.append(el('span', 'option-detail', opt.detail));
      if (opt.locked) text.append(el('span', 'option-lock', `Locked: ${opt.locked}`));
      b.append(text);
      if (!opt.locked) b.addEventListener('click', () => this.choose(opt.id));
      li.append(b);
      list.append(li);
    });
    return list;
  }
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toneClass(tone?: string): string {
  return tone ? `tone-${tone}` : '';
}

function renderLine(line: Line): HTMLElement {
  if (!line.text) return el('div', 'line spacer');
  return el('p', `line ${toneClass(line.tone)}`, line.text);
}
