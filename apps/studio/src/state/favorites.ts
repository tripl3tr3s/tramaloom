import { z } from "zod";

/** Seeds this viewer starred, newest first. Per browser, never part of a document. */
export const MAX_FAVORITES = 48;
const KEY = "gridloom.favorites";
const HashList = z.array(z.string().regex(/^[0-9a-f]{64}$/));

/** Star or unstar: a new seed goes to the front, the oldest falls off past the limit. */
export function toggleFavorite(list: readonly string[], hash: string): readonly string[] {
  return list.includes(hash) ? list.filter((h) => h !== hash) : [hash, ...list].slice(0, MAX_FAVORITES);
}

/** Whatever storage held, keep only well-formed, distinct hashes. */
export function parseFavorites(raw: unknown): readonly string[] {
  const parsed = HashList.safeParse(raw);
  return parsed.success ? [...new Set(parsed.data)].slice(0, MAX_FAVORITES) : [];
}

export function loadFavorites(): readonly string[] {
  try {
    return parseFavorites(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveFavorites(list: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode or blocked storage: favourites still work until the tab closes.
  }
}
