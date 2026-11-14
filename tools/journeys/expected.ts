/**
 * What the rules say a journey's board should read: the game's own session, stepped beside the
 * page with the same clock. A journey compares the board to this, never to a typed-in number,
 * so a retune moves both together and only a broken rule turns a journey red (#552).
 */
import type { Move } from "../../src/economy/actions.ts";
import {
  createMountain,
  type AwayReport,
  type Mountain,
} from "../../src/mountain.ts";
import { parseSaveValue } from "../../src/persist.ts";
import {
  createSession,
  firstNotice,
  step,
  type Session,
} from "../../src/session.ts";

/** How often the open game folds the crew's work in (src/screen-run.ts). */
export const TICK_MS = 1000;

export class Expected {
  private session: Session;
  /** The last moment the game's one-second tick ran, on the page's clock. */
  private ticked: number;

  private constructor(session: Session, at: number) {
    this.session = session;
    this.ticked = at;
  }

  /** A first open with nothing saved, at `at`: the store's fresh mountain, seeded the same. */
  static fresh(at: number): Expected {
    const opened = step(
      createSession(createMountain(), at),
      { kind: "tick" },
      at,
    );
    return new Expected(opened.session, at);
  }

  /**
   * A stored save opened at `at`: parsed the way the game parses it, then its time away paid.
   * `report` is what the welcome card shows.
   */
  static opened(
    json: string,
    at: number,
  ): { expected: Expected; report: AwayReport | undefined } {
    const parsed = parseSaveValue(JSON.parse(json));
    if (parsed === undefined) {
      throw new Error("The journey's save does not parse");
    }
    const paid = step(
      createSession(parsed.mountain, at),
      { kind: "away", since: parsed.lastSeen },
      at,
    );
    return {
      expected: new Expected(paid.session, at),
      report: firstNotice(paid.session.news, "away")?.report,
    };
  }

  get mountain(): Mountain {
    return this.session.mountain;
  }

  get pocket(): number {
    return this.session.mountain.pocket;
  }

  /** The page's clock reached `now`: run every one-second tick the game ran on the way. */
  until(now: number): void {
    while (this.ticked + TICK_MS <= now) {
      this.ticked += TICK_MS;
      this.session = step(this.session, { kind: "tick" }, this.ticked).session;
    }
  }

  /**
   * A player move at `now`, settled first the way the store settles it. True when the rules
   * applied it. A refused move changes nothing: the player would not have tapped it.
   */
  move(move: Move, now: number): boolean {
    this.until(now);
    const settled = step(this.session, { kind: "tick" }, now).session;
    const moved = step(settled, { kind: "move", move }, now);
    const applied = moved.effects.some(
      (effect) => effect.kind === "moved" && effect.result.kind === "applied",
    );
    if (applied) {
      this.session = moved.session;
    }
    return applied;
  }

  /**
   * The first tick after `now`, within `limitMs`, at which the rules would apply `move` with
   * no other move between; undefined when there is none.
   */
  firstTickAllowing(
    move: Move,
    now: number,
    limitMs: number,
  ): number | undefined {
    const probe = new Expected(this.session, this.ticked);
    probe.until(now);
    for (let at = probe.ticked + TICK_MS; at <= now + limitMs; at += TICK_MS) {
      probe.until(at);
      if (probe.allows(move, at)) {
        return at;
      }
    }
    return undefined;
  }

  /** Whether the rules would apply `move` at `now`, without making it. */
  allows(move: Move, now: number): boolean {
    return new Expected(this.session, this.ticked).move(move, now);
  }
}
