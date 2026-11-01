// Dice roll animation: a d20 tumbles, lands on the real result, then shows the math and the tier.
// Purely visual; the engine has already decided the outcome before this plays.
import { TIER_LABEL, titleCase, type RollEvent } from '../engine/roll';

const TUMBLE_MS = 900;
const HOLD_MS = 1100;
const REDUCED_HOLD_MS = 800;
const SETTING_KEY = 'votann.dice';

export function diceEnabled(): boolean {
  try {
    return window.localStorage.getItem(SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setDiceEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(SETTING_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the setting just won't persist.
  }
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// A d20 seen face-on: hexagon outline, a front triangle, and the edges joining them.
const DIE_SVG = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <polygon class="die-body" points="50,4 90,27 90,73 50,96 10,73 10,27"/>
  <polygon class="die-face" points="50,20 80,70 20,70"/>
  <path class="die-edge" d="M50,4 L50,20 M90,27 L80,70 M90,73 L80,70 M50,96 L80,70 M50,96 L20,70 M10,73 L20,70 M10,27 L20,70 M10,27 L50,20 M90,27 L50,20"/>
</svg>`;

export class DiceOverlay {
  private node: HTMLElement | null = null;
  private timers: number[] = [];
  private finishCurrent: (() => void) | null = null;
  private skipping = false;

  get busy(): boolean {
    return this.node !== null;
  }

  /** Ends the whole sequence at once. */
  skip(): void {
    this.skipping = true;
    this.finishCurrent?.();
  }

  async play(rolls: RollEvent[]): Promise<void> {
    if (!rolls.length) return;
    this.skipping = false;
    this.node = document.createElement('div');
    this.node.className = 'dice-overlay';
    this.node.setAttribute('role', 'status');
    this.node.addEventListener('click', () => this.skip());
    document.body.append(this.node);
    for (let i = 0; i < rolls.length && !this.skipping; i++) await this.playOne(rolls[i], i, rolls.length);
    this.clearTimers();
    this.node.remove();
    this.node = null;
  }

  private playOne(r: RollEvent, index: number, count: number): Promise<void> {
    const reduced = reducedMotion();
    const card = document.createElement('div');
    card.className = 'dice-card';
    card.innerHTML = `
      <div class="dice-context"></div>
      <div class="dice-die rolling">${DIE_SVG}<span class="dice-number"></span></div>
      <div class="dice-math"></div>
      <div class="dice-tier"></div>
      <div class="dice-hint"></div>`;
    const $ = (sel: string) => card.querySelector(sel) as HTMLElement;
    $('.dice-context').textContent = r.context;
    $('.dice-hint').textContent = `${count > 1 ? `Roll ${index + 1} of ${count}. ` : ''}Click or press any key to skip`;
    this.node!.replaceChildren(card);

    const die = $('.dice-die');
    const number = $('.dice-number');

    return new Promise((resolve) => {
      const land = () => {
        this.clearTimers();
        number.textContent = String(r.die);
        die.classList.remove('rolling');
        die.classList.add('landed', `tier-${r.tier}`);
        $('.dice-math').textContent = mathLine(r);
        const tier = $('.dice-tier');
        tier.textContent = r.natural === 'crit' ? `Natural ${r.sides}! ${TIER_LABEL[r.tier]}` : r.natural === 'fumble' ? `Natural 1. ${TIER_LABEL[r.tier]}` : TIER_LABEL[r.tier];
        tier.className = `dice-tier tier-${r.tier}`;
        this.finishCurrent = done;
        this.timers.push(window.setTimeout(done, reduced ? REDUCED_HOLD_MS : HOLD_MS));
      };
      const done = () => {
        this.clearTimers();
        this.finishCurrent = null;
        resolve();
      };

      if (reduced) {
        land();
        return;
      }
      // Flicker random faces, slowing down, then land on the real result.
      this.finishCurrent = done;
      let elapsed = 0;
      let step = 45;
      const flicker = () => {
        number.textContent = String(1 + Math.floor(Math.random() * r.sides));
        elapsed += step;
        step = Math.min(160, Math.round(step * 1.18));
        if (elapsed >= TUMBLE_MS) land();
        else this.timers.push(window.setTimeout(flicker, step));
      };
      flicker();
    });
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }
}

function mathLine(r: RollEvent): string {
  const parts = [`d${r.sides} ${r.die}`];
  if (r.statLabel) parts.push(`${r.statLabel} ${r.statValue}`);
  let math = parts.join(' + ');
  if (r.modifierTotal > 0) math += ` + ${r.modifierTotal} mods`;
  if (r.modifierTotal < 0) math += ` - ${-r.modifierTotal} mods`;
  const name = r.difficultyName ? `${titleCase(r.difficultyName)} ` : '';
  return `${math} = ${r.total}   vs   ${name}${r.difficulty}`;
}
