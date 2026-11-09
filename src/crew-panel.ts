import borerUrl from "./assets/board/mach-borer.png";
import tarpUrl from "./assets/board/mach-borer-tarp.png";
import cartUrl from "./assets/board/mach-cart.png";
import drillUrl from "./assets/board/mach-drill.png";
import kidDimUrl from "./assets/board/mach-kid-dim.png";
import kidUrl from "./assets/board/mach-kid.png";
import machineDimUrl from "./assets/board/mach-machine-dim.png";
import machineUrl from "./assets/board/mach-machine.png";
import workerUrl from "./assets/board/mach-worker.png";
import { el, write } from "./board-dom";
import { createBoardSheet, type BoardSheet } from "./board-drawer";
import { boardHowCard } from "./board-how-art";
import { createBoardRow, type BoardRow } from "./board-row";
import { skin } from "./board-skin";
import { BUY_SECTIONS, buyRowView, type BuyIcon } from "./buys-rows";
import { buyOnTap } from "./card-tap";
import { buyCrew } from "./crew";
import { crewCounts } from "./crew-count";
import { grandpaPost, staffNeeded } from "./engineers";
import { reducedMotion } from "./float-text";
import { formatCompact } from "./format";
import type { Mountain } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { effectiveRates, firstIdleTier } from "./rates";
import type { ReadyPick } from "./ready-now";
import {
  STAFFING_INTRO,
  TROUBLE_FIXED,
  crewPostLabel,
  crewPostsWords,
  grandpaChipWords,
  grandpaSentence,
  stonesASecond,
  workerWords,
} from "./screen-words";
import { markTaught, showsDot } from "./teach";
import { TIERS, owned, tierById, type TierId } from "./tiers";
import { watchFixHold } from "./trouble-tap";

/*
 * The Buys drawer (#373): the Crew section with its sentence and chips, then a row per tier in
 * the drawer skin, Crew first and Machines under it, and the Ready now footnote. Every row's
 * words come from buys-rows.ts; every buy goes through today's mutations: the guided hire,
 * buyWithTeach, pressTrouble and fixTrouble.
 */

/**
 * Today's card buy: one of `id`. Any worker hired while a machine stands
 * idle is the first use of staffing (#246), so it marks staffing taught.
 */
export function buyWithTeach(mountain: Mountain, id: TierId): Mountain {
  const next = buyCrew(mountain, id);
  return id === "helper" &&
    next.helpers > mountain.helpers &&
    showsDot(mountain, "staffing")
    ? markTaught(next, "staffing")
    : next;
}

/** The kick under the title while staffing has nothing to teach. */
const BUYS_KICK = "Crew and machines that mine while you rest";
/** How the Ready now plate picks, under the list. */
const READY_FOOT =
  "Ready now offers the biggest machine your free workers can run and you can afford. It saves for the next one when nothing is affordable, offers a worker only when no hand is free, and never buys for you.";
/** How long a fix's thanks holds the kick. */
const THANKS_MS = 1_600;

/** Each Buys icon's board art, at 32 art px. */
const BUY_ICON: Readonly<Record<BuyIcon, string>> = {
  worker: workerUrl,
  kid: kidUrl,
  "kid-dim": kidDimUrl,
  cart: cartUrl,
  drill: drillUrl,
  borer: borerUrl,
  tarp: tarpUrl,
  machine: machineUrl,
  "machine-dim": machineDimUrl,
};

/** What a row shows before the save is in: the tier's own art, never a lock read from a save. */
const FIRST_ICON: Readonly<Record<TierId, BuyIcon>> = {
  helper: "worker",
  kid: "kid",
  cart: "cart",
  drill: "drill",
  borer: "borer",
  machine: "machine",
};

const COUNT_STEPS = 8;
const COUNT_STEP_MS = 60;

interface TierRow {
  readonly id: TierId;
  readonly row: BoardRow;
}

function hide(target: HTMLElement, hidden: boolean): void {
  if (target.hidden !== hidden) {
    target.hidden = hidden;
  }
}

function mark(target: HTMLElement, name: string, on: boolean): void {
  if (target.classList.contains(name) !== on) {
    target.classList.toggle(name, on);
  }
}

/** A section's legend: its name, engraved, and the column's name at the right. */
function legend(name: string, key: string, column?: string): HTMLElement {
  const sec = el("div", "board-sec");
  sec.dataset["sec"] = key;
  sec.append(el("span", "board-lg", name));
  if (column !== undefined) {
    sec.append(el("span", "board-lg", column));
  }
  return sec;
}

/** A post chip the crew has emptied while the drawer is open: it reads zero in its place. */
function zeroChip(bit: {
  readonly key: string;
  readonly text: string;
}): string {
  return bit.key === "pool" || bit.key === "grandpa"
    ? bit.text
    : `0 on ${bit.key}`;
}

/** The idle machine shown as the staffing New row (#246), while it is. */
function guidedOf(
  mountain: Mountain,
  at: number,
  trouble: ProgressSnapshot["trouble"],
): TierId | undefined {
  return showsDot(mountain, "staffing")
    ? firstIdleTier(mountain, at, trouble)
    : undefined;
}

/**
 * The Buys drawer. `pick` is the Ready now pick the screen painted on the plate this frame,
 * so a row's amber lamp always agrees with it. `open` lays the crew chips out on the open
 * drawer and brings the staffing New row into view.
 */
export function createCrewPanel({
  progress,
  getView,
  now,
  pick,
  clock,
  door,
  signal,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  /** The game's clock: rates, trouble and the New row. */
  now: () => number;
  pick: () => ReadyPick;
  /** Milliseconds for the drawer's settle (the screen's tap clock). */
  clock: () => number;
  /** The drawer's key on the rail: the shell writes its aria-expanded (#373). */
  door?: HTMLElement;
  /** Aborting it removes the drawer's document listeners. */
  signal?: AbortSignal;
}): {
  sheet: BoardSheet;
  render: () => void;
  open: (from?: HTMLElement) => void;
} {
  const sheet = createBoardSheet({
    name: "buys",
    title: "Buys",
    infoLabel: "Buys",
    clock,
    ...(door === undefined ? {} : { door }),
    // Shut, the list takes its latest layout: rows, legends and chips.
    onClose: () => {
      unfreeze();
    },
    ...(signal === undefined ? {} : { signal }),
  });
  sheet.kick(BUYS_KICK);

  // The "i": staffing and layers in the drawer's place, one Back under the last.
  const howCards = (["staffing", "layers"] as const).map((system) =>
    boardHowCard(system, "Back to Buys", () => {
      sheet.showHow(false);
    }),
  );
  const firstBack = howCards[0]?.querySelector<HTMLElement>(".teach-how-back");
  if (firstBack) {
    firstBack.hidden = true;
  }
  sheet.how.append(...howCards);
  sheet.info.addEventListener("click", () => {
    sheet.showHow(true);
  });

  // The Crew section: the crew's sentence, then where the hands are, as chips.
  const crew = el("section", "crew");
  crew.setAttribute("aria-label", "Your crew");
  const crewStatus = el("p", "crew-status");
  crewStatus.setAttribute("aria-live", "polite");
  // Text, not a door. The full sentence is spoken from hidden words; the chips say it again in
  // short, for the eye only.
  const posts = el("p", "crew-posts");
  posts.hidden = true;
  const postsWords = el("span", "crew-posts-words");
  posts.append(postsWords);
  crew.append(crewStatus, posts);

  const crewSpeed = (): number =>
    effectiveRates(getView().mountain, now(), getView().trouble).crewPerSecond;

  /** The crew line counts up to the new rate after a purchase. */
  let rateShown: number | undefined;
  let countTimer: ReturnType<typeof setInterval> | undefined;
  const countCrewRate = (from: number, to: number): void => {
    if (countTimer !== undefined) {
      clearInterval(countTimer);
      countTimer = undefined;
    }
    if (reducedMotion() || to <= from) {
      rateShown = undefined;
      renderCrew();
      return;
    }
    let step = 0;
    rateShown = from;
    renderCrew();
    countTimer = setInterval(() => {
      step += 1;
      rateShown =
        step >= COUNT_STEPS
          ? undefined
          : Math.round(from + ((to - from) * step) / COUNT_STEPS);
      if (rateShown === undefined) {
        clearInterval(countTimer);
        countTimer = undefined;
      }
      renderCrew();
    }, COUNT_STEP_MS);
  };

  const thank = (): void => {
    sheet.flash(TROUBLE_FIXED, THANKS_MS);
  };

  /** A tap on the staffing New row hires a worker; the hold keeps a second tap off the machine. */
  const hire = (row: BoardRow): void => {
    const rateBefore = crewSpeed();
    const before = progress.getSnapshot().mountain.helpers;
    progress.applyMutation((mountain) => buyWithTeach(mountain, "helper"));
    if (progress.getSnapshot().mountain.helpers > before) {
      row.done();
      countCrewRate(rateBefore, crewSpeed());
    }
  };

  const rows: readonly TierRow[] = [
    ...BUY_SECTIONS.crew,
    ...BUY_SECTIONS.machines,
  ].map((id) => {
    const tier = tierById(id);
    const row = createBoardRow({
      tag: "button",
      className: "tier",
      data: { tier: id },
      name: tier.name,
      icon: true,
    });
    row.setIcon(BUY_ICON[FIRST_ICON[id]]);
    const root = row.root;
    if (!(root instanceof HTMLButtonElement)) {
      return { id, row };
    }
    const troubledHere = (snapshot: ProgressSnapshot) =>
      snapshot.trouble?.tier === id ? snapshot.trouble : undefined;
    const hold = watchFixHold(root, {
      tier: () => troubledHere(progress.getSnapshot())?.tier,
      fix: (troubledTier) => {
        progress.fixTrouble(troubledTier);
        if (progress.getSnapshot().trouble === undefined) {
          thank();
          row.hold();
        }
      },
    });
    buyOnTap(
      root,
      root,
      (press) => {
        // The click that ends a hold that fixed is not a tap.
        if (hold.heldFix()) {
          return;
        }
        const snapshot = progress.getSnapshot();
        if (!snapshot.ready) {
          return;
        }
        const troubled = troubledHere(snapshot);
        // The second tap of the double tap that opened Buys spends nothing. A trouble press is
        // not a spend, so it still counts, in the settle and in a Done hold alike.
        if (press.early && troubled === undefined) {
          return;
        }
        // A second sleepy tap inside the Done hold buys nothing.
        if (row.holding() && troubled === undefined) {
          return;
        }
        // Read again at the tap: a pocket that fell since the last paint buys nothing.
        const at = now();
        const fresh = buyRowView({
          mountain: snapshot.mountain,
          now: at,
          trouble: snapshot.trouble,
          tier: id,
          pick: pick(),
          guided: guidedOf(snapshot.mountain, at, snapshot.trouble),
        });
        // A row the open drawer holds in place for a tier no longer shown sells nothing.
        if (!fresh.shown || !fresh.can) {
          row.blink();
          return;
        }
        // The guided idle machine hires its crew. Another one would stand idle too, so the New
        // row never buys more of it.
        if (fresh.guided) {
          hire(row);
          return;
        }
        if (troubled !== undefined) {
          progress.pressTrouble(troubled.tier);
          if (progress.getSnapshot().trouble === undefined) {
            thank();
            // The burst of presses that fixed it must not run on into a buy, even inside the
            // hold of an earlier buy.
            row.hold();
          }
          return;
        }
        const before = owned(snapshot.mountain, tier);
        const rateBefore = crewSpeed();
        progress.applyMutation((mountain) => buyWithTeach(mountain, id));
        if (owned(progress.getSnapshot().mountain, tier) > before) {
          row.done();
          countCrewRate(rateBefore, crewSpeed());
        }
      },
      { settling: () => sheet.settling() },
    );
    return { id, row };
  });

  const crewSec = legend("Crew", "crew", "per sec");
  const machineSec = legend("Machines", "machines");
  const foot = el("p", "board-sheet-foot", READY_FOOT);
  const rowOf = (id: TierId): HTMLElement[] =>
    rows.filter((item) => item.id === id).map((item) => item.row.root);
  const parts = [
    crewSec,
    crew,
    ...BUY_SECTIONS.crew.flatMap(rowOf),
    machineSec,
    ...BUY_SECTIONS.machines.flatMap(rowOf),
    foot,
  ];
  // Until the save is in, nothing from it shows: no row, legend, crew line or footnote.
  for (const part of parts) {
    part.hidden = true;
  }
  const spare = sheet.list.querySelector(".board-spare");
  if (spare === null) {
    sheet.list.append(...parts);
  } else {
    spare.before(...parts);
  }

  /**
   * Rows never move under a finger (#373): while the drawer is open with a save in, every part
   * keeps the place it had as it opened. What a part should be is kept here and applied while
   * the drawer is shut and as it opens. Words still change in place.
   */
  const wanted = new Map<HTMLElement, boolean>();
  let frozen = false;
  const place = (part: HTMLElement, hidden: boolean): void => {
    wanted.set(part, hidden);
    if (!frozen) {
      hide(part, hidden);
    }
  };

  /** One crew chip: what it stands for, and its words. */
  interface ChipBit {
    readonly key: string;
    readonly text: string;
  }
  /** The chips the crew has now. */
  let chipBits: readonly ChipBit[] = [];
  /** The chips on the line, and in how many rows. */
  let chipsShown: readonly ChipBit[] = [];
  let chipLines = 0;
  /** One chip per place on the line, reused: each keeps its tag skin. */
  const chipPool: HTMLElement[] = [];
  const chipAt = (index: number, text: string): HTMLElement => {
    let chip = chipPool[index];
    if (chip === undefined) {
      chip = el("span", "crew-bit");
      chip.append(el("span", "crew-bit-text"));
      skin(chip, "tag");
      chipPool[index] = chip;
    }
    const words = chip.querySelector<HTMLElement>(".crew-bit-text");
    if (words !== null) {
      write(words, text);
    }
    return chip;
  };
  /** `bits` in exactly `lines` rows, as even as they go. */
  const paintChips = (bits: readonly ChipBit[], lines: number): void => {
    const base = Math.floor(bits.length / lines);
    const extra = bits.length % lines;
    let next = 0;
    posts.replaceChildren(
      postsWords,
      ...Array.from({ length: lines }, (_, index) => {
        const line = el("span", "crew-row");
        line.setAttribute("aria-hidden", "true");
        for (let i = 0; i < base + (index < extra ? 1 : 0); i += 1) {
          line.append(chipAt(next, bits[next]?.text ?? ""));
          next += 1;
        }
        return line;
      }),
    );
    chipsShown = bits;
    chipLines = lines;
  };
  /**
   * Fewest even rows whose widest row fits the line. A shut drawer has no width to measure,
   * so Buys calls this again once it is open (#371).
   */
  const layoutChips = (): void => {
    if (posts.hidden || chipBits.length === 0) {
      return;
    }
    for (let lines = 1; lines <= chipBits.length; lines += 1) {
      paintChips(chipBits, lines);
      if (!crewRowsOverflow(posts)) {
        break;
      }
    }
  };
  /**
   * The open drawer's chips: the same chips in the same rows, their words new. A chip the crew
   * no longer has reads zero; a new one joins only if it fits the rows already there.
   */
  const refreshChips = (): void => {
    if (chipLines === 0) {
      return;
    }
    const latest = new Map(chipBits.map((bit) => [bit.key, bit.text]));
    const kept = chipsShown.map((bit) => ({
      key: bit.key,
      text: latest.get(bit.key) ?? zeroChip(bit),
    }));
    const added = chipBits.filter(
      (bit) => !chipsShown.some((shown) => shown.key === bit.key),
    );
    if (added.length > 0 && kept.length + added.length >= chipLines) {
      paintChips([...kept, ...added], chipLines);
      if (!crewRowsOverflow(posts)) {
        return;
      }
    }
    paintChips(kept, chipLines);
  };

  /** The open drawer holds its layout from here; shut, it takes the latest. */
  const freeze = (): void => {
    frozen = true;
    // Words that grow in place run on past the line rather than wrap a chip row (board.css).
    mark(posts, "is-frozen", true);
  };
  const unfreeze = (): void => {
    frozen = false;
    mark(posts, "is-frozen", false);
    for (const [part, hidden] of wanted) {
      hide(part, hidden);
    }
    layoutChips();
  };

  const renderCrew = (): void => {
    const { mountain: current, trouble } = getView();
    const at = now();
    const rates = effectiveRates(current, at, trouble);
    const rate = rateShown ?? rates.crewPerSecond;
    const { spare: free } = crewCounts(current, at, trouble);
    const idle = TIERS.reduce(
      (total, tier) => total + owned(current, tier) - rates.running[tier.id],
      0,
    );
    mark(crewStatus, "crew-short", rates.helpersShort > 0);
    mark(crewStatus, "crew-waiting", rate === 0);
    write(
      crewStatus,
      rates.helpersShort > 0
        ? `${formatCompact(rate)}/s · ${formatCompact(idle)} idle, need ${formatCompact(rates.helpersShort)} ${workerWords(rates.helpersShort)}`
        : rate === 0
          ? "No crew yet. Hire a worker to mine for you."
          : rate >= 1_000
            ? // Compact once it's big, so the line never wraps on a phone.
              `Your crew mines ${formatCompact(rate)} stones/s`
            : `Your crew mines ${stonesASecond(rate)}`,
    );
    const pool = current.helpers + current.kids;
    const stations = TIERS.flatMap((tier) => {
      const label = crewPostLabel(tier.id);
      return label === undefined
        ? []
        : [
            {
              label,
              workers: rates.running[tier.id] * staffNeeded(current, tier),
            },
          ];
    });
    const grandpa = grandpaPost(current);
    const fullPosts = `${crewPostsWords(pool, free, stations)}${grandpa === undefined ? "" : `. ${grandpaSentence(grandpa)}`}`;
    place(posts, pool <= 0);
    write(postsWords, fullPosts);
    const bits: readonly ChipBit[] =
      pool <= 0
        ? []
        : [
            {
              key: "pool",
              text: `${formatCompact(pool)} ${workerWords(pool)}`,
            },
            ...stations
              .filter((post) => post.workers > 0)
              .map((post) => ({
                key: post.label,
                text: `${formatCompact(post.workers)} on ${post.label}`,
              })),
            // After a pass, the old dad tends the biggest machine (#338).
            ...(grandpa === undefined
              ? []
              : [{ key: "grandpa", text: grandpaChipWords(grandpa) }]),
          ];
    const same = (a: readonly ChipBit[], b: readonly ChipBit[]): boolean =>
      a.length === b.length &&
      a.every((bit, index) => bit.text === b[index]?.text);
    if (same(bits, chipBits)) {
      return;
    }
    chipBits = bits;
    if (frozen) {
      refreshChips();
      return;
    }
    if (bits.length === 0) {
      posts.replaceChildren(postsWords);
      chipsShown = [];
      chipLines = 0;
      return;
    }
    layoutChips();
  };

  const render = (): void => {
    const view = getView();
    if (!view.ready) {
      // The rows go dark and keep their places: names and icons only, disabled, no numbers.
      for (const { row } of rows) {
        row.render(undefined);
        mark(row.root, "teach-new", false);
        delete row.root.dataset["trouble"];
      }
      // The crew's sentence and chips are the old save's: blank, in their places.
      mark(crew, "is-blank", true);
      mark(crewSec, "is-blank", true);
      sheet.kick(BUYS_KICK);
      if (sheet.isOpen()) {
        sheet.fitSpare();
      }
      return;
    }
    const current = view.mountain;
    const at = now();
    const painted = pick();
    const guided = guidedOf(current, at, view.trouble);
    let machinesShowing = false;
    for (const { id, row } of rows) {
      const rowView = buyRowView({
        mountain: current,
        now: at,
        trouble: view.trouble,
        tier: id,
        pick: painted,
        guided,
      });
      place(row.root, !rowView.shown);
      if (rowView.shown && tierById(id).staff > 0) {
        machinesShowing = true;
      }
      row.setIcon(BUY_ICON[rowView.icon]);
      row.render(rowView);
      mark(row.root, "teach-new", rowView.guided);
      const trouble = rowView.state === "trouble" ? view.trouble : undefined;
      if (trouble === undefined) {
        if (row.root.dataset["trouble"] !== undefined) {
          delete row.root.dataset["trouble"];
        }
      } else if (row.root.dataset["trouble"] !== trouble.kind) {
        row.root.dataset["trouble"] = trouble.kind;
      }
    }
    place(crewSec, false);
    place(crew, false);
    place(machineSec, !machinesShowing);
    place(foot, false);
    mark(crew, "is-blank", false);
    mark(crewSec, "is-blank", false);
    renderCrew();
    // A drawer opened before the save was in lays out once, as the save lands.
    if (sheet.isOpen()) {
      freeze();
    }
    sheet.kick(showsDot(current, "staffing") ? STAFFING_INTRO : BUYS_KICK);
    if (sheet.isOpen()) {
      sheet.fitSpare();
    }
  };

  const open = (from?: HTMLElement): void => {
    const opening = !sheet.isOpen();
    if (opening) {
      unfreeze();
    }
    sheet.open(from);
    if (opening) {
      // The crew chips were measured while the drawer was shut: fit them now.
      layoutChips();
      // A save that is in sets the layout; one still loading sets it as it lands.
      if (getView().ready) {
        freeze();
      }
    }
    // The staffing New row: bring it into view. Some test DOMs have no scrollIntoView.
    const fresh: Partial<Element> | null = sheet.list.querySelector(
      ".board-row.teach-new",
    );
    fresh?.scrollIntoView?.({ block: "nearest" });
  };

  return { sheet, render, open };
}

function crewRowsOverflow(line: HTMLElement): boolean {
  if (!line.isConnected || line.clientWidth <= 0) {
    return false;
  }
  const rows = [...line.querySelectorAll<HTMLElement>(".crew-row")];
  // A row that wrapped (board.css lets a row wrap rather than clip) also overflows: its chips
  // do not all share one line.
  const wrapped = (row: HTMLElement): boolean => {
    const tops = [...row.querySelectorAll<HTMLElement>(".crew-bit")].map(
      (chip) => chip.offsetTop,
    );
    return tops.some((top) => top !== tops[0]);
  };
  if (
    rows.some((row) => row.scrollWidth > row.clientWidth + 1 || wrapped(row))
  ) {
    return true;
  }
  return rows.length === 1 && line.scrollWidth > line.clientWidth + 1;
}
