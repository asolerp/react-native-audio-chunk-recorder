/**
 * Simple StateManager implementation using in-memory storage
 * For apps that don't use external state management libraries
 */

import type { StateManager } from '../types';

export const createSimpleStateManager = (): StateManager => {
  const state = new Map<string, any>();
  const listeners = new Map<string, Set<(value: any) => void>>();

  return {
    getState: <T>(key: string): T => {
      return state.get(key) as T;
    },

    setState: <T>(key: string, value: T): void => {
      const prevValue = state.get(key);
      if (prevValue === value) return; // Avoid unnecessary updates

      state.set(key, value);

      // Notify listeners
      const keyListeners = listeners.get(key);
      if (keyListeners) {
        keyListeners.forEach(listener => {
          try {
            listener(value);
          } catch (error) {
            console.error(`Error in state listener for key "${key}":`, error);
          }
        });
      }
    },

    subscribe: <T>(key: string, callback: (value: T) => void): (() => void) => {
      if (!listeners.has(key)) {
        listeners.set(key, new Set());
      }

      const keyListeners = listeners.get(key)!;
      keyListeners.add(callback);

      // Call immediately with current value
      const currentValue = state.get(key);
      if (currentValue !== undefined) {
        callback(currentValue);
      }

      // Return unsubscribe function
      return () => {
        keyListeners.delete(callback);
        if (keyListeners.size === 0) {
          listeners.delete(key);
        }
      };
    }
  };
};
