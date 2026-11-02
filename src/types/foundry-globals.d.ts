interface FoundrySettingOptions {
  name: string;
  hint: string;
  scope: "client" | "world";
  config: boolean;
  type: StringConstructor;
  default: string;
  password?: boolean;
}

interface FoundrySettings {
  register(
    namespace: string,
    key: string,
    options: FoundrySettingOptions,
  ): void;
  get(namespace: string, key: string): unknown;
  registerMenu(
    namespace: string,
    key: string,
    options: {
      name: string;
      label: string;
      hint: string;
      icon: string;
      type: new () => { render(options?: { force?: boolean }): unknown };
      restricted: boolean;
    },
  ): void;
}

interface FoundryGame {
  settings: FoundrySettings;
  system: {
    id: string;
    config: {
      skills: Record<string, { label?: string; ability?: string }>;
      abilities?: Record<string, { label?: string }>;
      languages?: Record<string, unknown>;
      armorProficiencies?: Record<string, unknown>;
      weaponProficiencies?: Record<string, unknown>;
      toolProficiencies?: Record<string, unknown>;
    };
  };
  actors: {
    contents: readonly FoundryActor[];
  };
  folders: {
    contents: readonly FoundryFolder[];
  };
  packs: readonly FoundryPack[];
  notifications: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}

interface FoundryActor {
  id: string;
  name: string;
  folder: string | null;
  exportToJSON(): string | Promise<string>;
  toObject(): Record<string, unknown>;
}

interface FoundryFolder {
  id: string;
  name: string;
  type: string;
}

interface FoundryPackIndexEntry {
  _id: string;
  name: string;
  type?: string;
}

interface FoundryItemDocument {
  id: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
  toObject(): Record<string, unknown>;
}

interface FoundryPack {
  documentName: string;
  metadata: {
    id: string;
  };
  getIndex(options?: {
    fields?: string[];
  }): Promise<readonly FoundryPackIndexEntry[]>;
  getDocument(id: string): Promise<FoundryItemDocument | null>;
}

interface FoundryActorDocumentClass {
  createDocuments(
    documents: readonly object[],
  ): Promise<FoundryActor[]>;
}

interface FoundryFolderDocumentClass {
  create(document: Record<string, unknown>): Promise<FoundryFolder>;
}

interface FoundryConfig {
  Actor: {
    documentClass: FoundryActorDocumentClass;
  };
  Folder: {
    documentClass: FoundryFolderDocumentClass;
  };
}

interface FoundryHooks {
  once(event: string, callback: () => void): void;
}

interface ApplicationV2Options {
  id?: string;
  classes?: string[];
  window?: {
    title?: string;
    icon?: string;
    resizable?: boolean;
  };
  position?: {
    width?: number;
    height?: number;
  };
  actions?: Record<
    string,
    (event: Event, target: HTMLElement) => void | Promise<void>
  >;
}

interface ApplicationV2Instance {
  render(options?: { force?: boolean }): this;
  close(options?: { force?: boolean }): Promise<void>;
  _prepareContext(
    options: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

interface ApplicationV2Constructor {
  new (options?: ApplicationV2Options): ApplicationV2Instance;
}

interface HandlebarsApplicationMixinFunction {
  <TBase extends ApplicationV2Constructor>(base: TBase): TBase;
}

interface FoundryApplicationsApi {
  ApplicationV2: ApplicationV2Constructor;
  HandlebarsApplicationMixin: HandlebarsApplicationMixinFunction;
}

interface FoundryApplications {
  api: FoundryApplicationsApi;
}

interface FoundryGlobal {
  applications: FoundryApplications;
}

declare const game: FoundryGame;
declare const Hooks: FoundryHooks;
declare const foundry: FoundryGlobal;
declare const CONFIG: FoundryConfig;
declare function fromUuid(uuid: string): Promise<FoundryItemDocument | null>;
