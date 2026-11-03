// Port market: per-port prices, reputation and class modifiers, upgrades, goods, feasts, rumors.
// game-overview.md section 4.5.
import { allMet, lockedReason } from './conditions';
import { applyEffects, cargoSpace, moduleLabel } from './effects';
import { passDay } from './travel';
import {
  consoleActionFor,
  injuryName,
  itemOf,
  liveWaaagh,
  relicOf,
  marketOf,
  portOpen,
  subclassOf,
  systemOf,
  waaaghBand,
  type Ctx,
} from './rules';
import { MODULE_KEYS } from './schema';
import { identifyRelic, relicLabel, sellRelic } from './relics';
import type { GameState, Line, ModuleKey, Option } from './types';

type Market = NonNullable<ReturnType<typeof marketOf>>;

export function currentMarket(state: GameState, ctx: Ctx): Market | null {
  if (!state.docked || !portOpen(ctx.data, state, state.location)) return null;
  const own = marketOf(ctx.data, state.location);
  if (own) return own;
  // A new home port trades like Hold Durnvar did.
  if (state.story.home_port !== state.location) return null;
  const hold = marketOf(ctx.data, ctx.data.config.ACT3_RALLY_SYSTEM);
  return hold ? { ...hold, port: state.location } : null;
}

/** Multiplier on everything the player buys here (before rounding). */
export function buyMultiplier(state: GameState, ctx: Ctx, market: Market, essentials = false): number {
  const cfg = ctx.data.config;
  let m = market.buy_multiplier;
  const rep = state.reputation[systemOf(ctx.data, market.port).faction] ?? 0;
  if (rep >= cfg.REPUTATION_DISCOUNT_AT) m *= 1 - cfg.REPUTATION_DISCOUNT;
  else if (rep < cfg.REPUTATION_SURCHARGE_BELOW) m *= 1 + cfg.REPUTATION_SURCHARGE;
  const meter = liveWaaagh(state);
  if (essentials && meter !== null) m *= waaaghBand(cfg, meter).price_multiplier;
  if (state.haggle_active) m *= 1 - haggleRate(state, ctx);
  return m;
}

export function sellMultiplier(state: GameState, ctx: Ctx, market: Market, item: string): number {
  let m = market.sell_multiplier * (market.buys[item] ?? 1);
  if (state.haggle_active) m *= 1 + haggleRate(state, ctx);
  m *= 1 + (subclassOf(ctx.data, state.character.subclass).trait.market_sell_bonus ?? 0);
  return m;
}

function haggleRate(state: GameState, ctx: Ctx): number {
  return subclassOf(ctx.data, state.character.subclass).console_action.market_haggle ?? 0;
}

const price = (base: number, mult: number) => Math.max(1, Math.round(base * mult));

export function fuelPrice(state: GameState, ctx: Ctx, market: Market): number | null {
  return market.fuel_price === null ? null : price(market.fuel_price, buyMultiplier(state, ctx, market, true));
}

export function suppliesPrice(state: GameState, ctx: Ctx, market: Market): number | null {
  return market.supplies_price === null ? null : price(market.supplies_price, buyMultiplier(state, ctx, market, true));
}

export function upgradePrice(state: GameState, ctx: Ctx, market: Market, module: ModuleKey): number | null {
  const next = state.ship.modules[module] + 1;
  const base = ctx.data.config.MODULE_UPGRADE_COST[String(next)];
  if (base === undefined) return null;
  const discount = subclassOf(ctx.data, state.character.subclass).trait.market_upgrade_discount ?? 0;
  return price(base, buyMultiplier(state, ctx, market) * (1 - discount));
}

export function goodPrice(state: GameState, ctx: Ctx, market: Market, item: string): number {
  return price(market.sells[item], buyMultiplier(state, ctx, market));
}

/** What the port pays for one unit; 0 for mission items, which can't be sold. */
export function sellPrice(state: GameState, ctx: Ctx, market: Market, item: string): number {
  const info = itemOf(ctx.data, item);
  if (info.mission || info.value <= 0) return 0;
  return price(info.value, sellMultiplier(state, ctx, market, item));
}

export const MARKET_SECTIONS = ['fuel', 'upgrades', 'goods', 'sell', 'services'] as const;
export type MarketSection = (typeof MARKET_SECTIONS)[number];
const SECTION_LABEL: Record<MarketSection, string> = {
  fuel: 'Fuel and Supplies',
  upgrades: 'Upgrades',
  goods: 'Goods',
  sell: 'Sell cargo',
  services: 'Services',
};

/** The market screen: the list of sections, or one section's options (game-overview.md 4.5). Ids are unprefixed. */
export function marketOptions(state: GameState, ctx: Ctx, section: MarketSection | null = null): { body: Line[]; options: Option[] } {
  const cfg = ctx.data.config;
  const market = currentMarket(state, ctx);
  if (!market) return { body: [{ text: 'There is no market here.', tone: 'muted' }], options: [] };
  const r = state.resources;
  const body: Line[] = [
    { text: `${systemOf(ctx.data, market.port).display_name.toUpperCase()} MARKET`, tone: 'heading' },
    { text: `You have ${r.ore} Ore. Cargo space ${cargoSpace(state)}/${state.ship.cargo_capacity}.`, tone: 'muted' },
  ];
  if (state.haggle_active) body.push({ text: 'Haggle is in effect for this visit.', tone: 'good' });
  if (liveWaaagh(state) !== null && waaaghBand(cfg, liveWaaagh(state)).price_multiplier > 1)
    body.push({ text: 'The Waaagh! has pushed up the price of Fuel and Supplies.', tone: 'bad' });

  const sec: Record<MarketSection, Option[]> = { fuel: [], upgrades: [], goods: [], sell: [], services: [] };
  const canAfford = (cost: number) => (r.ore < cost ? `Needs ${cost} Ore` : undefined);

  const fp = fuelPrice(state, ctx, market);
  if (fp !== null) {
    const room = cfg.FUEL_MAX - r.fuel;
    const fill = Math.min(room, Math.floor(r.ore / fp));
    sec.fuel.push({ id: 'buy:fuel:1', label: `Buy 1 Fuel (${fp} Ore)`, locked: room <= 0 ? 'Tank full' : canAfford(fp) });
    sec.fuel.push({
      id: 'buy:fuel:fill',
      label: `Fill the tank (+${Math.max(fill, 0)} Fuel, ${Math.max(fill, 0) * fp} Ore)`,
      locked: room <= 0 ? 'Tank full' : fill <= 0 ? `Needs ${fp} Ore` : undefined,
    });
  }
  const sp = suppliesPrice(state, ctx, market);
  if (sp !== null) {
    const room = cfg.SUPPLIES_MAX - r.supplies;
    sec.fuel.push({ id: 'buy:supplies:5', label: `Buy 5 Supplies (${sp * 5} Ore)`, locked: room < 5 ? 'Hold full' : canAfford(sp * 5) });
    const fill = Math.min(room, Math.floor(r.ore / sp));
    sec.fuel.push({
      id: 'buy:supplies:fill',
      label: `Stock up (+${Math.max(fill, 0)} Supplies, ${Math.max(fill, 0) * sp} Ore)`,
      locked: room <= 0 ? 'Hold full' : fill <= 0 ? `Needs ${sp} Ore` : undefined,
    });
  }

  for (const m of market.upgrades) {
    const cost = upgradePrice(state, ctx, market, m);
    const lvl = state.ship.modules[m];
    sec.upgrades.push({
      id: `upgrade:${m}`,
      label: cost === null ? `${moduleLabel(m)} (max level)` : `Upgrade ${moduleLabel(m)} to level ${lvl + 1} (${cost} Ore)`,
      detail: upgradeHint(ctx, m),
      locked: cost === null ? 'Max level' : canAfford(cost),
    });
  }

  for (const item of Object.keys(market.sells)) {
    const cost = goodPrice(state, ctx, market, item);
    sec.goods.push({
      id: `good:${item}`,
      label: `Buy 1 ${itemOf(ctx.data, item).display_name} (${cost} Ore)`,
      locked: cargoSpace(state) <= 0 ? 'Cargo hold full' : canAfford(cost),
    });
  }

  for (const slot of state.cargo) {
    const each = sellPrice(state, ctx, market, slot.key);
    const name = itemOf(ctx.data, slot.key).display_name;
    if (each <= 0) continue;
    sec.sell.push({ id: `sell:${slot.key}:1`, label: `Sell 1 ${name} (+${each} Ore)` });
    if (slot.qty > 1) sec.sell.push({ id: `sell:${slot.key}:all`, label: `Sell all ${slot.qty} ${name} (+${each * slot.qty} Ore)` });
  }

  if (market.feast) {
    const cost = price(cfg.FEAST_COST, buyMultiplier(state, ctx, market));
    const gain = state.character.kin_type === 'IRONKIN' ? cfg.FEAST_HEARTHFIRE_IRONKIN : cfg.FEAST_HEARTHFIRE;
    sec.services.push({ id: 'feast', label: `Hold a feast for the crew (${cost} Ore)`, detail: `+${gain} Hearthfire`, locked: canAfford(cost) });
  }

  for (const rumor of market.rumors) {
    if (state.story.flags[`RUMOR_${rumor.key}`]) continue;
    const cost = price(rumor.price, buyMultiplier(state, ctx, market));
    sec.services.push({
      id: `rumor:${rumor.key}`,
      label: `${rumor.label} (${cost} Ore)`,
      tone: 'accent',
      locked: lockedReason(state, ctx.data, rumor.requirements) ?? canAfford(cost),
    });
  }

  // Injuries (combat-system.md 3.8): Kin rest them off, Ironkin pay for repairs.
  const injury = state.character.injuries[0];
  if (injury) {
    const name = injuryName(ctx.data, state.character, injury);
    if (state.character.kin_type === 'KIN')
      sec.services.push({ id: 'rest', label: `Rest and heal: ${name} (${cfg.INJURY_REST_DAYS} days)`, detail: 'Days pass as usual.', tone: 'good' });
    else
      sec.services.push({
        id: 'repair_injury',
        label: `Maintenance: repair ${name} (${cfg.INJURY_REPAIR_ORE} Ore)`,
        locked: canAfford(cfg.INJURY_REPAIR_ORE),
        tone: 'good',
      });
  }

  // Relics: sold for their value; identified for Ore at ports that do it.
  state.relics.forEach((relic, i) => {
    const info = relicOf(ctx.data, relic.key);
    if (!info.mission) sec.sell.push({ id: `sellrelic:${i}`, label: `Sell relic: ${relicLabel(ctx, relic)} (+${info.value} Ore)`, detail: relic.equipped ? 'Equipped: it will be unequipped first.' : undefined });
    if (!relic.identified && market.identify_relics)
      sec.services.push({ id: `identify:${i}`, label: `Identify relic: ${relicLabel(ctx, relic)} (${cfg.RELIC_IDENTIFY_ORE} Ore)`, locked: canAfford(cfg.RELIC_IDENTIFY_ORE), tone: 'accent' });
  });

  // Always available, so a captain with no Ore can still earn enough to fly on.
  sec.services.push({
    id: 'work',
    label: `Take dock work (${cfg.DOCK_WORK_DAYS} days, +${cfg.DOCK_WORK_ORE} Ore)`,
    detail: 'Hard, honest, and slow. Days pass as usual.',
    tone: 'muted',
  });

  const haggle = subclassOf(ctx.data, state.character.subclass).console_action.market_haggle;
  if (haggle) {
    const action = consoleActionFor(ctx.data, state.character);
    sec.services.push({
      id: 'haggle',
      label: `${action.name} (console action)`,
      detail: `${Math.round(haggle * 100)}% better prices for the rest of this visit${action.wearCost ? `. +${action.wearCost} Wear` : ''}`,
      locked: state.haggle_active ? 'Already used this visit' : undefined,
      tone: 'accent',
    });
  }
  if (section) {
    const options = sec[section];
    if (!options.length) body.push({ text: 'Nothing here right now.', tone: 'muted' });
    return { body: [...body, { text: '' }, { text: SECTION_LABEL[section].toUpperCase(), tone: 'heading' }], options: [...options, { id: 'section:', label: 'Back to the market', tone: 'muted' }] };
  }
  const options = MARKET_SECTIONS.map((k) => ({
    id: `section:${k}`,
    label: SECTION_LABEL[k],
    detail: sec[k].length ? `${sec[k].length} option${sec[k].length > 1 ? 's' : ''}` : 'Nothing right now',
  }));
  return { body, options };
}


function upgradeHint(ctx: Ctx, m: ModuleKey): string {
  const cfg = ctx.data.config;
  switch (m) {
    case 'weapons':
    case 'shields':
    case 'engine':
      return 'Raises the power cap for this system by 1 in ship combat';
    case 'reactor':
      return `+${cfg.REACTOR_PIPS_PER_LEVEL} power pip in ship combat`;
    case 'cargo_hold':
      return `+${cfg.CARGO_CAPACITY_PER_HOLD_LEVEL} cargo capacity`;
    case 'scanner':
      return 'Clearer reads of enemy ships';
    case 'workshop':
      return 'Cheaper Wear maintenance';
    case 'armour':
      return `+${cfg.ARMOUR_HULL_PER_LEVEL} max Hull`;
  }
}

/** Applies a market choice. Returns lines for a notice, or null if nothing happened. */
export function marketChoice(state: GameState, ctx: Ctx, id: string): Line[] | null {
  const cfg = ctx.data.config;
  const market = currentMarket(state, ctx);
  if (!market) return null;
  const r = state.resources;
  const parts = id.split(':');
  const pay = (cost: number): boolean => {
    if (r.ore < cost) return false;
    r.ore -= cost;
    return true;
  };

  switch (parts[0]) {
    case 'buy': {
      const kind = parts[1] as 'fuel' | 'supplies';
      const each = kind === 'fuel' ? fuelPrice(state, ctx, market) : suppliesPrice(state, ctx, market);
      if (each === null) return null;
      const max = (kind === 'fuel' ? cfg.FUEL_MAX : cfg.SUPPLIES_MAX) - r[kind];
      const want = parts[2] === 'fill' ? Math.min(max, Math.floor(r.ore / each)) : Math.min(max, Number(parts[2]));
      if (want <= 0 || !pay(want * each)) return null;
      r[kind] += want;
      return [{ text: `+${want} ${kind === 'fuel' ? 'Fuel' : 'Supplies'} for ${want * each} Ore.`, tone: 'good' }];
    }
    case 'upgrade': {
      const m = parts[1] as ModuleKey;
      if (!MODULE_KEYS.includes(m) || !market.upgrades.includes(m)) return null;
      const cost = upgradePrice(state, ctx, market, m);
      if (cost === null || !pay(cost)) return null;
      return [{ text: `-${cost} Ore`, tone: 'bad' }, ...applyEffects(state, ctx, [{ upgrade_module: m }])];
    }
    case 'good': {
      const item = parts[1];
      if (market.sells[item] === undefined || cargoSpace(state) <= 0) return null;
      const cost = goodPrice(state, ctx, market, item);
      if (!pay(cost)) return null;
      return [{ text: `-${cost} Ore`, tone: 'bad' }, ...applyEffects(state, ctx, [{ add_cargo: { key: item, qty: 1 } }])];
    }
    case 'sell': {
      const slot = state.cargo.find((c) => c.key === parts[1]);
      const each = slot ? sellPrice(state, ctx, market, slot.key) : 0;
      if (!slot || each <= 0) return null;
      const qty = parts[2] === 'all' ? slot.qty : 1;
      slot.qty -= qty;
      state.cargo = state.cargo.filter((c) => c.qty > 0);
      r.ore += qty * each;
      return [{ text: `Sold ${qty} ${itemOf(ctx.data, parts[1]).display_name} for ${qty * each} Ore.`, tone: 'good' }];
    }
    case 'feast': {
      if (!market.feast) return null;
      const cost = price(cfg.FEAST_COST, buyMultiplier(state, ctx, market));
      if (!pay(cost)) return null;
      const gain = state.character.kin_type === 'IRONKIN' ? cfg.FEAST_HEARTHFIRE_IRONKIN : cfg.FEAST_HEARTHFIRE;
      return [
        { text: 'Long tables, roast grox, and too much ale. The crew sings until the station lights dim.' },
        { text: `-${cost} Ore`, tone: 'bad' },
        ...applyEffects(state, ctx, [{ hearthfire: gain }]),
      ];
    }
    case 'rumor': {
      const rumor = market.rumors.find((x) => x.key === parts[1]);
      if (!rumor || state.story.flags[`RUMOR_${rumor.key}`] || !allMet(state, rumor.requirements)) return null;
      const cost = price(rumor.price, buyMultiplier(state, ctx, market));
      if (!pay(cost)) return null;
      state.story.flags[`RUMOR_${rumor.key}`] = true;
      return [{ text: rumor.text }, { text: `-${cost} Ore`, tone: 'bad' }, ...applyEffects(state, ctx, rumor.effects)];
    }
    case 'work': {
      const lines: Line[] = [{ text: 'You and the crew hire out to the dock gangs.' }];
      for (let i = 0; i < cfg.DOCK_WORK_DAYS; i++) lines.push(...passDay(state, ctx));
      r.ore += cfg.DOCK_WORK_ORE;
      lines.push({ text: `+${cfg.DOCK_WORK_ORE} Ore`, tone: 'good' });
      return lines;
    }
    case 'sellrelic':
      return sellRelic(state, ctx, Number(parts[1]));
    case 'identify': {
      const relic = state.relics[Number(parts[1])];
      if (!relic || relic.identified || !market.identify_relics || !pay(cfg.RELIC_IDENTIFY_ORE)) return null;
      return [{ text: `-${cfg.RELIC_IDENTIFY_ORE} Ore`, tone: 'bad' }, ...identifyRelic(state, ctx, Number(parts[1]))];
    }
    case 'rest': {
      const injury = state.character.injuries[0];
      if (!injury || state.character.kin_type !== 'KIN') return null;
      const lines: Line[] = [];
      for (let i = 0; i < cfg.INJURY_REST_DAYS; i++) lines.push(...passDay(state, ctx));
      state.character.injuries.shift();
      lines.push({ text: `Quiet days in port. ${injuryName(ctx.data, state.character, injury)} has healed.`, tone: 'good' });
      return lines;
    }
    case 'repair_injury': {
      const injury = state.character.injuries[0];
      if (!injury || state.character.kin_type !== 'IRONKIN' || !pay(cfg.INJURY_REPAIR_ORE)) return null;
      state.character.injuries.shift();
      return [
        { text: `-${cfg.INJURY_REPAIR_ORE} Ore`, tone: 'bad' },
        { text: `The dock techs swap out the damaged parts. ${injuryName(ctx.data, state.character, injury)} is repaired.`, tone: 'good' },
      ];
    }
    case 'haggle': {
      const rate = haggleRate(state, ctx);
      if (!rate || state.haggle_active) return null;
      state.haggle_active = true;
      const action = consoleActionFor(ctx.data, state.character);
      const lines: Line[] = [{ text: `${action.name}: the traders sigh and start again from the top.`, tone: 'good' }];
      if (action.wearCost && state.character.wear !== null)
        lines.push(...applyEffects(state, ctx, [{ wear: action.wearCost }], { nonLethal: true }));
      return lines;
    }
  }
  return null;
}
