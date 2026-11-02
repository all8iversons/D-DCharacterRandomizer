import { vi } from "vitest";

Object.defineProperty(globalThis, "Hooks", {
  configurable: true,
  value: {
    once: vi.fn(),
    on: vi.fn(),
    callAll: vi.fn(),
  },
});

Object.defineProperty(globalThis, "game", {
  configurable: true,
  value: {
    settings: {
      register: vi.fn(),
      get: vi.fn(),
    },
    system: {
      id: "dnd5e",
      config: {
        skills: {},
      },
    },
    actors: {
      contents: [],
    },
    folders: {
      contents: [],
    },
    packs: [],
    notifications: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
});

Object.defineProperty(globalThis, "foundry", {
  configurable: true,
  value: {
    applications: {
      api: {},
    },
    config: {
      Actor: {
        documentClass: {
          createDocuments: vi.fn(),
        },
      },
      Folder: {
        documentClass: {
          create: vi.fn(),
        },
      },
    },
    fromUuid: vi.fn(async () => null),
  },
});
