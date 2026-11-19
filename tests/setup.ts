import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    promise: vi.fn(),
  },
}));

vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

vi.mock('@/store/composeId', () => ({
  default: {
    getState: () => ({ id: 'test-id', setId: vi.fn() }),
  },
}));

vi.mock('@/store/metadataMap', () => ({
  default: {
    getState: () => ({
      positionMap: new Map(),
      connectionMap: new Map(),
      resourceMeta: new Map(),
      setPositionMap: vi.fn(),
      setConnectionMap: vi.fn(),
    }),
  },
}));

vi.mock('@/store/disabled', () => ({
  default: {
    getState: () => ({ state: false }),
  },
}));

vi.mock('@/store/systemStore', () => ({
  useSystemStore: {
    getState: () => ({ usedPorts: [] }),
  },
}));

vi.mock('@/store/selection', () => ({
  default: {
    getState: () => ({ selectedString: '', setSelectedString: vi.fn() }),
  },
}));

// The store screenshot helpers only need a minimal window. Keep the shape
// realistic enough for libraries that read `window.location` / `history` at
// import time (e.g. axios).
global.window = {
  location: {
    href: 'http://localhost/',
    origin: 'http://localhost',
    search: '',
    pathname: '/',
  },
  history: {
    pushState: vi.fn(),
    replaceState: vi.fn(),
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as any;
global.document = { querySelector: vi.fn() } as any;
(globalThis as any).useComposeStore = { getState: vi.fn() };
