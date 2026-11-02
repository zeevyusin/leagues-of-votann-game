// Save slots in browser storage: one autosave plus manual slots, with JSON export/import.
import type { GameData } from '../engine/schema';
import { systemOf } from '../engine/rules';
import { migrateState, type GameState } from '../engine/types';

const PREFIX = 'votann.';
export const AUTOSAVE = 'autosave';

export interface SaveRecord {
  format: 'votann-save';
  saved_at: string;
  summary: string;
  state: GameState;
}

export function slotKey(slot: number): string {
  return `slot.${slot}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function summarize(state: GameState, data: GameData): string {
  return `${state.character.name}, day ${state.day}, ${systemOf(data, state.location).display_name}`;
}

export function writeSave(key: string, state: GameState, data: GameData): boolean {
  const record: SaveRecord = { format: 'votann-save', saved_at: new Date().toISOString(), summary: summarize(state, data), state };
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function readSave(key: string): SaveRecord | null {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    return raw ? parseSave(raw) : null;
  } catch {
    return null;
  }
}

/** Parses and checks a save. Throws with a readable message if it cannot be used. */
export function parseSave(raw: string): SaveRecord {
  const record = JSON.parse(raw) as SaveRecord;
  if (record?.format !== 'votann-save' || !record.state) throw new Error('This is not a Votann save file.');
  return { ...record, state: migrate(record.state) };
}

/** Checks a save is usable, then upgrades it to the current state shape (engine/types.ts migrateState). */
function migrate(state: GameState): GameState {
  if (!Array.isArray(state.scenes) || !state.scenes.length || !state.character) throw new Error('This save file is damaged.');
  return migrateState(state);
}

export function exportSave(state: GameState, data: GameData): void {
  const record: SaveRecord = { format: 'votann-save', saved_at: new Date().toISOString(), summary: summarize(state, data), state };
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = state.character.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  a.href = url;
  a.download = `votann_${safeName}_day${state.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickSaveFile(): Promise<SaveRecord> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file chosen.'));
      try {
        resolve(parseSave(await file.text()));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Could not read that file.'));
      }
    };
    input.click();
  });
}
