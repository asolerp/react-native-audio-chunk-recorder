/**
 * Jotai adapter for StateManager interface
 * For apps that use Jotai for state management
 */

import type { StateManager } from '../types';

// These would be imported from jotai in the actual app
interface Atom<T> {
  read: (get: any) => T;
  write: (get: any, set: any, update: T) => void;
}

interface JotaiStore {
  get: <T>(atom: Atom<T>) => T;
  set: <T>(atom: Atom<T>, value: T) => void;
  sub: (atom: any, listener: () => void) => () => void;
}

export const createJotaiStateManager = (
  store: JotaiStore,
  atoms: Record<string, Atom<any>>
): StateManager => {
  return {
    getState: <T>(key: string): T => {
      const atom = atoms[key];
      if (!atom) {
        throw new Error(`No atom found for key: ${key}`);
      }
      return store.get(atom) as T;
    },

    setState: <T>(key: string, value: T): void => {
      const atom = atoms[key];
      if (!atom) {
        throw new Error(`No atom found for key: ${key}`);
      }
      store.set(atom, value);
    },

    subscribe: <T>(key: string, callback: (value: T) => void): (() => void) => {
      const atom = atoms[key];
      if (!atom) {
        throw new Error(`No atom found for key: ${key}`);
      }
      return store.sub(atom, () => {
        const value = store.get(atom);
        callback(value);
      });
    }
  };
};

// Example usage in an app:
/*
import { atom, useAtom } from 'jotai';
import { createJotaiStateManager } from 'react-native-audio-chunk-recorder/adapters/jotaiAdapter';

const audioInterruptionAtom = atom(false);
const audioAlertActiveAtom = atom(false);

const atoms = {
  'audioInterruption': audioInterruptionAtom,
  'audioAlertActive': audioAlertActiveAtom
};

const stateManager = createJotaiStateManager(store, atoms);
*/
