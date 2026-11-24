import type { Vars } from "./i18n.tsx";
import { translate } from "./i18n.tsx";
import type { MessageKey } from "./messages.ts";

/** An error the studio raised itself: its message is English, `key` says it in any language. */
export interface Localized {
  readonly key: MessageKey;
  readonly vars?: Vars | undefined;
}

export class LocalizedError extends Error implements Localized {
  readonly key: MessageKey;
  readonly vars: Vars | undefined;
  constructor(key: MessageKey, vars?: Vars) {
    super(translate("en", key, vars));
    this.name = "LocalizedError";
    this.key = key;
    this.vars = vars;
  }
}

const isLocalized = (e: unknown): e is Error & Localized =>
  e instanceof Error && typeof (e as Partial<Localized>).key === "string";

/**
 * What to show for a caught error: the studio's own errors in the studio's language,
 * anything else (a browser or script error) as it was written.
 */
export function errorText(e: unknown, t: (key: MessageKey, vars?: Vars) => string): string {
  if (isLocalized(e)) return t(e.key, e.vars);
  return e instanceof Error ? e.message : String(e);
}
