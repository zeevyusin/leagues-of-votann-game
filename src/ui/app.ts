// The browser console. Renders a View from the engine and turns key presses and clicks into choices.
import type { GameData } from '../engine/schema';
import { applyChoiceWithRolls, buildView } from '../engine/game';
import type { RollEvent } from '../engine/roll';
import { DiceOverlay, diceEnabled } from './dice';
import { ABOUT_LINES, HELP_PAGES, VERSION } from './help';
import { DICE_SETTINGS, TEXT_SIZES, applySettings, cycle, loadSettings, saveSettings } from './settings';
import { creationChoose, creationView, newDraft, newGame, type CreationDraft } from '../engine/creation';
import { newSeed } from '../engine/rng';
import type { GameState, HubTab, Line, Option, View } from '../engine/types';
import { AUTOSAVE, exportSave, pickSaveFile, readSave, slotKey, writeSave } from './saves';

type Mode =
  | { kind: 'title'; message?: string }
  | { kind: 'creation'; draft: CreationDraft }
  | { kind: 'game'; state: GameState; menu: boolean; message?: string };

/** How to play, Settings and About open over the title screen or the System menu. */
type Panel = { kind: 'help'; page: number } | { kind: 'settings' } | { kind: 'about' } | null;

/** Lists longer than this page (game-overview.md 9.0). */
const MAX_OPTIONS = 10;
const PAGE_SIZE = 8;
const PREV_ID = '__page:prev';
const NEXT_ID = '__page:next';

/** An option as shown on screen, with the key that picks it. */
interface Shown {
  opt: Option;
  key: string;
}

const TAB_LABELS: Record<HubTab, string> = { comms: 'Comms', nav: 'Nav', ship: 'Ship', logbook: 'Logbook', market: 'Market' };

/** The Market tab only appears while docked at a port with a market. */
function tabOrder(view: View): HubTab[] {
  const tabs: HubTab[] = ['comms', 'nav', 'ship', 'logbook'];
  if (view.tabs?.market) tabs.push('market');
  return tabs;
}

export class App {
  private mode: Mode = { kind: 'title' };
  private lastScreenKey = '';
  private dice = new DiceOverlay();
  /** Rolls from the last choice, animated after the next render. */
  private pendingRolls: RollEvent[] = [];
  private panel: Panel = null;
  /** Page of a long option list, reset whenever the screen changes. */
  private page = 0;
  private pageKey = '';

  constructor(
    private root: HTMLElement,
    private data: GameData,
  ) {
    applySettings(loadSettings());
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
    options.push({ id: 'panel:help', label: 'How to play', tone: 'muted' });
    options.push({ id: 'panel:settings', label: 'Settings', tone: 'muted' });
    options.push({ id: 'panel:about', label: 'About', tone: 'muted' });
    return {
      kind: 'title',
      title: 'Votann Command Console',
      subtitle: `A text adventure on a Kin prospector's bridge. Version ${VERSION}`,
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
    options.push({ id: 'panel:help', label: 'How to play' });
    options.push({ id: 'panel:settings', label: 'Settings', detail: 'Text size, dice animation, reduced motion' });
    options.push({ id: 'panel:about', label: 'About' });
    options.push({ id: 'sys:quit', label: 'Quit to title', detail: 'Your progress is autosaved.', tone: 'muted' });
    return {
      kind: 'system',
      title: 'System',
      subtitle: `${state.character.name}, day ${state.day}`,
      body: message ? [{ text: message, tone: 'good' }] : [{ text: 'The game autosaves after every choice.', tone: 'muted' }],
      options,
    };
  }

  private panelView(panel: NonNullable<Panel>): View {
    if (panel.kind === 'about') return { kind: 'about', title: 'About', body: ABOUT_LINES, options: [{ id: 'panel:close', label: 'Back', tone: 'accent' }] };
    if (panel.kind === 'settings') {
      const st = loadSettings();
      return {
        kind: 'settings',
        title: 'Settings',
        subtitle: 'Saved in this browser only',
        body: [{ text: 'Press an option to change it.', tone: 'muted' }],
        options: [
          { id: 'panel:set:text', label: `Text size: ${cap(st.textSize)}` },
          { id: 'panel:set:dice', label: `Dice animation: ${cap(st.dice)}` },
          { id: 'panel:set:motion', label: `Reduced motion: ${st.reducedMotion ? 'On' : 'Off'}`, detail: 'Skips the dice tumble and other movement' },
          { id: 'panel:close', label: 'Back', tone: 'accent' },
        ],
      };
    }
    const page = HELP_PAGES[panel.page];
    const options: Option[] = [];
    if (panel.page + 1 < HELP_PAGES.length) options.push({ id: 'panel:help:next', label: `Next: ${HELP_PAGES[panel.page + 1].title}`, tone: 'accent' });
    if (panel.page > 0) options.push({ id: 'panel:help:prev', label: `Back: ${HELP_PAGES[panel.page - 1].title}` });
    options.push({ id: 'panel:close', label: 'Close the guide', tone: 'muted' });
    return { kind: 'help', title: `How to play: ${page.title}`, subtitle: `Page ${panel.page + 1} of ${HELP_PAGES.length}`, body: page.lines, options };
  }

  private panelChoice(id: string): void {
    const p = this.panel;
    if (id === 'panel:help') this.panel = { kind: 'help', page: 0 };
    else if (id === 'panel:settings') this.panel = { kind: 'settings' };
    else if (id === 'panel:about') this.panel = { kind: 'about' };
    else if (id === 'panel:close') this.panel = null;
    else if (p?.kind === 'help' && id === 'panel:help:next') this.panel = { kind: 'help', page: Math.min(HELP_PAGES.length - 1, p.page + 1) };
    else if (p?.kind === 'help' && id === 'panel:help:prev') this.panel = { kind: 'help', page: Math.max(0, p.page - 1) };
    else if (id.startsWith('panel:set:')) {
      const st = loadSettings();
      if (id === 'panel:set:text') st.textSize = cycle(TEXT_SIZES, st.textSize);
      if (id === 'panel:set:dice') st.dice = cycle(DICE_SETTINGS, st.dice);
      if (id === 'panel:set:motion') st.reducedMotion = !st.reducedMotion;
      saveSettings(st);
    }
  }

  private currentView(): View {
    if (this.panel) return this.panelView(this.panel);
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
    if (id === PREV_ID || id === NEXT_ID) {
      this.page += id === NEXT_ID ? 1 : -1;
      this.render();
      return;
    }
    if (id.startsWith('panel:')) {
      this.panelChoice(id);
      this.render();
      return;
    }
    try {
      this.handle(id, text);
    } catch (e) {
      console.error(e);
      if (this.mode.kind === 'game') this.mode.message = `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
    }
    this.render();
    const rolls = this.pendingRolls;
    this.pendingRolls = [];
    if (rolls.length && diceEnabled()) void this.dice.play(rolls);
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
    const result = applyChoiceWithRolls(mode.state, this.data, id, text);
    mode.state = result.state;
    this.pendingRolls = result.rolls;
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
    // While dice are rolling, any key skips the animation and does nothing else.
    if (this.dice.busy) {
      e.preventDefault();
      this.dice.skip();
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Escape' && this.panel) {
      this.panel = null;
      e.preventDefault();
      this.render();
      return;
    }
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
      const order = tabOrder(view);
      const i = order.indexOf(view.tabs.active);
      const next = order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length];
      this.choose(`tab:${next}`);
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      const shown = this.shownOptions(view).find((x) => x.key === e.key);
      if (shown && !shown.opt.locked) {
        e.preventDefault();
        this.choose(shown.opt.id);
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
    emblem.src = `${import.meta.env.BASE_URL}emblem.svg`;
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
      for (const t of tabOrder(view)) {
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
    screen.append(this.renderOptions(this.shownOptions(view)));
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

  /**
   * The options as shown, with their keys. Up to 10 show as 1-9 and 0. Longer lists page:
   * 8 options at a time, with 9 for the previous page and 0 for the next.
   */
  private shownOptions(view: View): Shown[] {
    const opts = view.options;
    const key = `${view.kind}|${view.title}|${view.subtitle ?? ''}`;
    if (key !== this.pageKey) {
      this.pageKey = key;
      this.page = 0;
    }
    if (opts.length <= MAX_OPTIONS) return opts.map((opt, i) => ({ opt, key: i < 9 ? String(i + 1) : '0' }));
    const pages = Math.ceil(opts.length / PAGE_SIZE);
    this.page = Math.max(0, Math.min(pages - 1, this.page));
    const shown: Shown[] = opts.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE).map((opt, i) => ({ opt, key: String(i + 1) }));
    if (this.page > 0) shown.push({ key: '9', opt: { id: PREV_ID, label: 'Previous page', detail: `Page ${this.page} of ${pages}`, tone: 'muted' } });
    if (this.page < pages - 1) shown.push({ key: '0', opt: { id: NEXT_ID, label: 'Next page', detail: `Page ${this.page + 2} of ${pages}`, tone: 'muted' } });
    return shown;
  }

  private renderOptions(options: Shown[]): HTMLElement {
    const list = el('ol', 'options');
    options.forEach(({ opt, key }) => {
      const li = el('li');
      const b = el('button', `option ${toneClass(opt.tone)}${opt.locked ? ' locked' : ''}`) as HTMLButtonElement;
      b.disabled = !!opt.locked;
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
