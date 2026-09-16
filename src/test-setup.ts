/**
 * Mise en place de l'environnement de test.
 *
 * Node ≥ 22 définit un global `localStorage` qui vaut `undefined` tant que
 * `--localstorage-file` n'est pas passé. Vitest, voyant la clé déjà présente sur
 * `globalThis`, n'y recopie pas celui de jsdom : les tests se retrouveraient sans
 * stockage du tout. On fournit donc une implémentation en mémoire conforme à
 * l'interface `Storage`.
 */

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value));
  }
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
