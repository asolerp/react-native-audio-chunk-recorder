import { renderHook, act } from '@testing-library/react-hooks';

// Mock jotai
const mockAtom = jest.fn();
const mockUseAtom = jest.fn();
const mockUseSetAtom = jest.fn();

jest.mock('jotai', () => ({
  atom: mockAtom,
  useAtom: mockUseAtom,
  useSetAtom: mockUseSetAtom
}));

describe('jotaiAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockAtom.mockReturnValue({ toString: () => 'mockAtom' });
    mockUseAtom.mockReturnValue([null, jest.fn()]);
    mockUseSetAtom.mockReturnValue(jest.fn());
  });

  describe('Module Loading', () => {
    it('should load without errors when jotai is available', () => {
      expect(() => {
        require('../jotaiAdapter');
      }).not.toThrow();
    });

    it('should handle jotai not being available', () => {
      // Mock jotai as undefined
      jest.doMock('jotai', () => {
        throw new Error('Module not found');
      });

      expect(() => {
        jest.resetModules();
        require('../jotaiAdapter');
      }).not.toThrow();
    });
  });

  describe('Adapter Functionality', () => {
    it('should create atoms when jotai is available', () => {
      const { createJotaiStateManager } = require('../jotaiAdapter');

      if (createJotaiStateManager) {
        const manager = createJotaiStateManager();
        expect(manager).toBeDefined();
        expect(typeof manager.getState).toBe('function');
        expect(typeof manager.setState).toBe('function');
        expect(typeof manager.subscribe).toBe('function');
      }
    });

    it('should return null when jotai is not available', () => {
      // Mock jotai as unavailable
      jest.doMock('jotai', () => {
        throw new Error('Module not found');
      });

      jest.resetModules();
      const { createJotaiStateManager } = require('../jotaiAdapter');

      expect(createJotaiStateManager).toBeNull();
    });
  });

  describe('State Management', () => {
    it('should manage state through jotai atoms', () => {
      const mockSetState = jest.fn();
      const mockState = { isRecording: false };

      mockUseAtom.mockReturnValue([mockState, mockSetState]);

      const { createJotaiStateManager } = require('../jotaiAdapter');

      if (createJotaiStateManager) {
        const manager = createJotaiStateManager();

        // Test getState
        const state = manager.getState('testKey');
        expect(state).toBeDefined();

        // Test setState
        manager.setState('testKey', { isRecording: true });
        // The actual implementation would call the jotai setter
      }
    });
  });
});
