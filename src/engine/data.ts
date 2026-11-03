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
import storyBeatsAct2 from '../../data/story_beats_act2.json';
import travelEvents from '../../data/travel_events.json';
import jobs from '../../data/jobs.json';
import storyThreads from '../../data/story_threads.json';
import actEvents from '../../data/act_events.json';
import markets from '../../data/markets.json';
import storyBeatsAct3 from '../../data/story_beats_act3.json';
import injuries from '../../data/injuries.json';
import endings from '../../data/endings.json';
import battleOaths from '../../data/battle_oaths.json';
import postQuests from '../../data/post_quests.json';
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
    // Job offers are Comms messages; they live in their own file to keep messages.json readable.
    messages: [...messages, ...jobs.messages, ...postQuests.messages],
    lore,
    enemies,
    enemy_ships: enemyShips,
    combat_encounters: combatEncounters,
    // Act 1, Act 2, Act 3, travel events, job beats and post-game quests all share the beat format.
    story_beats: [...storyBeats, ...storyBeatsAct2, ...storyBeatsAct3, ...travelEvents, ...jobs.beats, ...postQuests.beats],
    story_threads: storyThreads,
    act_events: actEvents,
    injuries,
    battle_oaths: battleOaths,
    post_quests: postQuests.quests,
    endings,
    markets,
  };
}

export function loadGameData(): GameData {
  return validateGameData(rawGameData());
}
