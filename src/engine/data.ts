// Loads every data file and validates it. Import `loadGameData` once at startup.
import config from '../../data/config.json';
import stats from '../../data/stats.json';
import kinTypes from '../../data/kin_types.json';
import baseClasses from '../../data/base_classes.json';
import subclasses from '../../data/subclasses.json';
import systems from '../../data/systems.json';
import factions from '../../data/factions.json';
import crew from '../../data/crew.json';
import items from '../../data/items.json';
import relics from '../../data/relics.json';
import oaths from '../../data/oaths.json';
import grudges from '../../data/grudges.json';
import messages from '../../data/messages.json';
import lore from '../../data/lore.json';
import enemies from '../../data/enemies.json';
import enemyShips from '../../data/enemy_ships.json';
import combatEncounters from '../../data/combat_encounters.json';
import storyBeats from '../../data/story_beats.json';
import { validateGameData, type GameData } from './schema';

export function rawGameData() {
  return {
    config,
    stats,
    kin_types: kinTypes,
    base_classes: baseClasses,
    subclasses,
    systems,
    factions,
    crew,
    items,
    relics,
    oaths,
    grudges,
    messages,
    lore,
    enemies,
    enemy_ships: enemyShips,
    combat_encounters: combatEncounters,
    story_beats: storyBeats,
  };
}

export function loadGameData(): GameData {
  return validateGameData(rawGameData());
}
