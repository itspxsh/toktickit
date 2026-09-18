import "@testing-library/jest-dom";

if (typeof window !== "undefined" && typeof window.localStorage?.clear !== "function") {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}
