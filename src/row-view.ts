/** A row's lamp: lamp.png's four frames. */
export type RowLamp = "off" | "amber" | "green" | "red";

/** What a drawer row is doing now. */
export type RowState =
  | "ready"
  | "short"
  | "dear"
  | "locked"
  | "trouble"
  | "running"
  | "owned"
  | "found";

/**
 * One drawer row's words and lamp (#373). Display only: the rules that build
 * it read the mountain and never change it.
 *
 * `info` and `flag` are fit options, longest first; `[]` shows nothing. An
 * empty string hides `badge`, `need`, `why`, `gain`, `price` or `verb`.
 * `can` means a tap acts now. Otherwise the row blinks.
 */
export interface RowView {
  readonly name: string;
  readonly badge: string;
  readonly info: readonly string[];
  readonly need: string;
  readonly why: string;
  readonly flag: readonly string[];
  readonly gain: string;
  readonly price: string;
  readonly dimTag: boolean;
  readonly verb: string;
  readonly lamp: RowLamp;
  readonly state: RowState;
  readonly pick: boolean;
  readonly can: boolean;
  readonly aria: string;
}
