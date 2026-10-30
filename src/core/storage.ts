// Where saves and settings live. The browser and desktop builds use localStorage; tests use the
// in-memory store. A file-based store for the desktop app can implement the same interface.

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(prefix: string): string[];
}

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.data.set(key, value);
  }
  remove(key: string): void {
    this.data.delete(key);
  }
  keys(prefix: string): string[] {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

export class LocalStore implements KeyValueStore {
  constructor(private readonly namespace = 'mxrpg:') {}
  get(key: string): string | null {
    try {
      return localStorage.getItem(this.namespace + key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string): void {
    localStorage.setItem(this.namespace + key, value);
  }
  remove(key: string): void {
    try {
      localStorage.removeItem(this.namespace + key);
    } catch {
      // Storage unavailable: nothing to remove.
    }
  }
  keys(prefix: string): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(this.namespace + prefix)) out.push(k.slice(this.namespace.length));
      }
    } catch {
      return [];
    }
    return out.sort();
  }
}

/**
 * localStorage when it works (it can be blocked in private windows), otherwise memory only. A test
 * build published beside the main game (the PR preview on GitHub Pages) passes its own namespace,
 * so its saves and settings never touch the main game's on the same site.
 */
export function defaultStore(namespace = 'mxrpg:'): KeyValueStore {
  try {
    const probe = `${namespace}probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalStore(namespace);
  } catch {
    return new MemoryStore();
  }
}
