// How to play and About: short pages for the System menu and the title screen (game-overview.md 9.0).
import type { Line } from '../engine/types';
import pkg from '../../package.json';

export const VERSION = pkg.version;

export interface HelpPage {
  title: string;
  lines: Line[];
}

const p = (text: string, tone?: Line['tone']): Line => ({ text, tone });
const gap: Line = { text: '' };

export const HELP_PAGES: HelpPage[] = [
  {
    title: 'The console',
    lines: [
      p('You command a Kin prospector ship. Everything happens through numbered menus: press 1 to 9, or 0 for the tenth option, or click.'),
      gap,
      p('Tab switches between the console screens: Comms (messages and jobs), Nav (travel), Ship (hull, cargo, crew, relics), Logbook (oaths, grudges, the Waaagh!) and, while docked, the Market.'),
      gap,
      p('Esc opens the System menu: save to a slot, export a save file, settings, and this guide. The game also autosaves after every choice.'),
      p('Long lists show 8 options at a time: 9 goes back a page and 0 goes forward.', 'muted'),
    ],
  },
  {
    title: 'Rolls',
    lines: [
      p('Risky actions roll a d20 and add a stat and modifiers, against a difficulty: Easy 8, Normal 11, Hard 14, Very Hard 17, Heroic 20.'),
      gap,
      p('Beat the difficulty by 5 or more, or roll a natural 20: critical success.', 'good'),
      p('Meet it or beat it by up to 4: success.', 'good'),
      p('Miss by 1 to 4: partial success. You get it, at a cost.', 'accent'),
      p('Miss by 5 or more, or roll a natural 1: failure. The story still moves on.', 'bad'),
      gap,
      p('Every option shows its stat and modifiers before you choose. Locked options say what they need.', 'muted'),
    ],
  },
  {
    title: 'Personal combat',
    lines: [
      p('Each round the enemy shows its intent: aggressive, guarded or evasive. A good Wits read shows it clearly; a bad one is vague, and some enemies lie.'),
      gap,
      p('Pick a stance. Defend counters aggressive, Attack counters evasive, Outmaneuver counters guarded (+3). The wrong match costs you (-2).'),
      p('Negotiate uses Silver Tongue against enemies who will talk. Leverage, like a grudge you know about, makes it easier.'),
      gap,
      p('Break their Resolve to win. If your Health hits 0 you are not killed: you wake up, at a cost. Big hits can leave injuries; treat them at a port market.'),
      p('Before round 1 you may swear a battle oath, and once per fight each crew member can be committed for a one-round boost.', 'muted'),
    ],
  },
  {
    title: 'Ship combat',
    lines: [
      p('Each round, split your reactor pips between Weapons (damage you deal), Shields (damage you absorb) and Engines (added to your roll).'),
      p("The enemy does the same: their shields soak your damage and their engines make them harder to hit. Your Scanner shows hints about their split."),
      gap,
      p('More engine pips than the enemy also wins the range: Close adds damage both ways, Long reduces it and makes Withdraw easier.'),
      p('Targeting their weapons, shields or engines is harder, but a hit knocks out pips there next round.'),
      gap,
      p('Upgrade modules at port markets. Armour raises your maximum Hull.', 'muted'),
    ],
  },
  {
    title: 'Keeping the crew going',
    lines: [
      p('Fuel moves the ship; Supplies feed the crew every day; Ore buys everything else. Dock work at any market always earns a little Ore.'),
      gap,
      p('Hearthfire is morale. High Hearthfire helps every roll, Low hurts, and at 0 the crew mutinies. Feasts, kept oaths and victories raise it.'),
      p('Ironkin build up Wear instead of tiring. Too much Wear hurts their rolls; maintenance brings it down.'),
      gap,
      p('Oaths are promises with rewards and penalties. Grudges are wrongs that wait to be settled. Both live in the Logbook.'),
      p('Relics have a benefit and a drawback. Equip up to two from the Ship screen.', 'muted'),
    ],
  },
  {
    title: 'The Waaagh!',
    lines: [
      p('After the raid, the Waaagh! meter appears in your Logbook. Every journey makes it grow. Breaking warbands and sabotaging the Orks pushes it back.'),
      gap,
      p('Finish any two of the four Act 2 threads to unlock Act 3, then sound the muster at Karrak Station or Hold Durnvar when you are ready.'),
      p('If the meter reaches 100 first, the Waaagh! launches without you, and the final battle starts at once in its hardest form.', 'bad'),
      gap,
      p('Every run reaches an ending. After the epilogue you can keep flying, finish what you left undone, and take on one last task.', 'muted'),
    ],
  },
];

export const ABOUT_LINES: Line[] = [
  p(`Votann Command Console, version ${VERSION}`, 'heading'),
  gap,
  p('A text adventure on the bridge of a Kin prospector ship, set in the Ashfall Reach.'),
  gap,
  p('Created by Ze\'ev Youssin. Built with Claude by Anthropic.'),
  p('Fonts: JetBrains Mono and Share Tech Mono, both under the SIL Open Font License.', 'muted'),
  gap,
  p(
    'Unofficial fan project. Not affiliated with or endorsed by Games Workshop. Warhammer 40,000, Leagues of Votann, and related names are trademarks of Games Workshop Ltd, used here without permission in a free, non-commercial work.',
    'muted',
  ),
];
