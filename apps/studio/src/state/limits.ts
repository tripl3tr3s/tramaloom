/** Shared by the reducer, the UI and the Zod schema so the UI can never create a doc that fails to reload. */
export const MAX_LAYERS = 32;
export const MAX_WEIGHT = 1000;
/** Script layers: characters of code, and params one script may declare. */
export const MAX_SCRIPT_CHARS = 20_000;
export const MAX_SCRIPT_PARAMS = 32;
