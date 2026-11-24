/**
 * Spanish text for the built-in modules and presets. Display only: documents, share links,
 * enum values and minted pieces keep the English ids and names that core defines.
 */
export interface ParamText {
  readonly label: string;
  readonly help: string;
  /** Shown names of an enum's values, keyed by the value itself. */
  readonly options?: Readonly<Record<string, string>>;
}

export interface ModuleText {
  readonly label: string;
  readonly description: string;
  readonly params: Readonly<Record<string, ParamText>>;
}

export type ModuleTexts = Readonly<Record<string, ModuleText>>;
