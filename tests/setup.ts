import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// happy-dom already provides localStorage + crypto.randomUUID. Keep
// minimal polyfills only as a safety net for other runners.
type MutableGlobal = typeof globalThis & {
  localStorage?: Storage;
  crypto?: Crypto;
};
const g = globalThis as MutableGlobal;

if (typeof g.localStorage === "undefined") {
  let store: Record<string, string> = {};
  const ls: Storage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i) => Object.keys(store)[i] ?? null,
  };
  g.localStorage = ls;
}

if (typeof g.crypto === "undefined" || typeof g.crypto.randomUUID !== "function") {
  const cryptoShim = (g.crypto ?? {}) as Crypto & { randomUUID?: () => string };
  cryptoShim.randomUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;
  g.crypto = cryptoShim as Crypto;
}

// Reset localStorage between tests
beforeEach(() => {
  localStorage.clear();
});
