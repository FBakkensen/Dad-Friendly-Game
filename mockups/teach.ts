import { chipTime, formatCompact } from "../src/format.ts";

/**
 * M11-2 teaching mocks (#240). Not the game. Three ways to bring in a
 * system the dad has never used: the workshop, materials (clay) and
 * upgrades. Each walks the same five steps: the dot badge and New note,
 * the reveal, the guided first use, the payoff line, and How it works.
 *
 *   A · Card: a reveal card with one big first-action button.
 *   B · In the sheet: no pop-up; the sheet opens on the new thing.
 *   C · Foreman: an old miner on the mountain says it, one line at a time.
 *
 * Every size and colour is a token from src/tokens.css.
 */

export type TeachOption = "a" | "b" | "c";
const TEACH_SYSTEMS = ["workshop", "materials", "upgrades"] as const;
const TEACH_STEPS = ["note", "reveal", "guide", "payoff", "how"] as const;
type TeachSystem = (typeof TEACH_SYSTEMS)[number];
type TeachStep = (typeof TEACH_STEPS)[number];

const ART = {
  helper: "/src/assets/helper-miner.png",
  pick: "/src/assets/pick.png",
  ore: "/src/assets/ore-lump.png",
  stone: "/src/assets/stone.png",
  hammer: "/src/assets/relics/hammer.png",
  lantern: "/src/assets/relics/lantern.png",
  upgrades: "/src/assets/upgrades-icon.png",
  mountain: "/src/assets/mountain.png",
  map: "/src/assets/worn-map.png",
  cart: "/src/assets/mine-cart.png",
  machine: "/src/assets/great-machine.png",
} as const;

type SheetCard = {
  readonly id: string;
  readonly art: string;
  readonly name: string;
  readonly price: string;
  readonly line: string;
  readonly dear?: boolean;
};

type Lesson = {
  readonly sheet: string;
  readonly bar: "workshop" | "upgrades";
  readonly art: string;
  /** One line beside the dot badge. */
  readonly note: string;
  readonly title: string;
  /** One or two lines. Real numbers for buys and crafts. */
  readonly lines: readonly [string] | readonly [string, string];
  /** The one big first-action button. */
  readonly action: string;
  readonly cards: readonly SheetCard[];
  /** The card the first use points at. */
  readonly target: string;
  readonly payoff: string;
  /** A timer the first use starts, if it is a timer. */
  readonly timer?: {
    readonly art: string;
    readonly times: string;
    readonly ms: number;
  };
  readonly how: readonly (readonly [string, string])[];
  readonly foreman: {
    readonly note: string;
    readonly payoff: string;
  };
};

const TWENTY_MIN = 20 * 60 * 1000;

const LESSONS: Readonly<Record<TeachSystem, Lesson>> = {
  workshop: {
    sheet: "Workshop",
    bar: "workshop",
    art: ART.hammer,
    note: "New · The Workshop is open",
    title: "The Workshop is open",
    lines: [
      "Turn the ore you dig into gear for the crew.",
      "Start small: Axle grease, 1 iron, ready in 10 min.",
    ],
    action: "Craft Axle grease · 1 iron",
    cards: [
      {
        id: "grease",
        art: ART.cart,
        name: "Axle grease",
        price: "1 iron",
        line: "Crew ×2 for 20 min · 10 min to make",
      },
      {
        id: "rails",
        art: ART.cart,
        name: "Iron rails",
        price: `${formatCompact(500_000)} · 4 iron`,
        line: "Carts haul 25% more",
        dear: true,
      },
      {
        id: "charge",
        art: ART.ore,
        name: "Blasting charge",
        price: `${formatCompact(100_000)} · 4 clay`,
        line: "Crew ×2 for 20 min",
      },
    ],
    target: "grease",
    payoff: "Axle grease is ready. Crew ×2 for 20 min.",
    timer: { art: ART.cart, times: "×2", ms: TWENTY_MIN },
    how: [
      [ART.hammer, "Pick a recipe. The bench makes one at a time."],
      [ART.ore, "Each one costs ore you dig, and some take stones."],
      [ART.lantern, "Timers like grease show on top while they run."],
      [ART.cart, "Cancel any time. Gear not started comes back in full."],
    ],
    foreman: {
      note: "The Workshop is open, friend. Let me show you.",
      payoff: "Nicely done. Crew ×2 for 20 min.",
    },
  },
  materials: {
    sheet: "Workshop",
    bar: "workshop",
    art: ART.ore,
    note: "New · You have 4 clay",
    title: "Clay, enough to blast",
    lines: [
      "Clay comes up with the Topsoil.",
      "4 clay and 100K stones make a Blasting charge.",
    ],
    action: "Craft Blasting charge · 4 clay",
    cards: [
      {
        id: "charge",
        art: ART.ore,
        name: "Blasting charge",
        price: `${formatCompact(100_000)} · 4 clay`,
        line: "Crew ×2 for 20 min · 10 min to make",
      },
      {
        id: "props",
        art: ART.stone,
        name: "Sturdy props",
        price: `${formatCompact(250_000)} · 10 clay · 4 iron`,
        line: "Trouble comes less often",
        dear: true,
      },
      {
        id: "rails",
        art: ART.cart,
        name: "Iron rails",
        price: `${formatCompact(500_000)} · 4 iron`,
        line: "Carts haul 25% more",
        dear: true,
      },
    ],
    target: "charge",
    payoff: "The charge is ready. Crew ×2 for 20 min.",
    timer: { art: ART.ore, times: "×2", ms: TWENTY_MIN },
    how: [
      [ART.ore, "Clay comes from the Topsoil. Iron from the Granite."],
      [ART.lantern, "Deeper rock hides something that glitters."],
      [ART.hammer, "The Workshop turns ore into gear and timers."],
      [ART.helper, "Ore waits safely in your pocket. Nothing spoils."],
    ],
    foreman: {
      note: "That clay is good for blasting. Let me show you.",
      payoff: "Boom. Crew ×2 for 20 min.",
    },
  },
  upgrades: {
    sheet: "Upgrades",
    bar: "upgrades",
    art: ART.helper,
    note: "New · Better boots",
    title: "Better boots",
    lines: [
      "Workers go from 1/s to 2.4/s.",
      `One buy, for good. ${formatCompact(650_000)} stones.`,
    ],
    action: `Buy Better boots · ${formatCompact(650_000)}`,
    cards: [
      {
        id: "boots",
        art: ART.helper,
        name: "Better boots",
        price: formatCompact(650_000),
        line: "Workers go from 1/s to 2.4/s",
      },
      {
        id: "arms",
        art: ART.pick,
        name: "Strong arms",
        price: formatCompact(46_000),
        line: "Each tap also mines 1.65% of crew speed",
      },
      {
        id: "steady",
        art: ART.lantern,
        name: "Steady hands",
        price: formatCompact(10_000_000),
        line: "Time away pays 25% more",
        dear: true,
      },
    ],
    target: "boots",
    payoff: "Boots on. Every worker now digs 2.4/s.",
    how: [
      [ART.helper, "Upgrades are one buy and last the whole mountain."],
      [ART.pick, "Boosts are timers: strong for a while, then they rest."],
      [ART.lantern, "Every running timer shows on top."],
      [ART.upgrades, "New ones show up when your crew is ready for them."],
    ],
    foreman: {
      note: "Those boots are nearly in reach. Have a look.",
      payoff: "Look at them go. Workers dig 2.4/s now.",
    },
  },
};

const RUNNING = [
  { art: ART.pick, times: "×2", ms: 299_000, name: "Sharper picks" },
  { art: ART.helper, times: "×2", ms: 1_740_000, name: "Overtime" },
] as const;

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tap(action: string): string {
  return `Presses in. ${action} Silent until unmuted.`;
}

function icon(src: string, extra = ""): string {
  return `<img class="kit-icon${extra}" src="${src}" alt="" />`;
}

function timers(lesson: Lesson, step: TeachStep): string {
  const running: {
    art: string;
    times: string;
    ms: number;
    name: string;
    fresh?: boolean;
  }[] = [...RUNNING];
  if (step === "payoff" && lesson.timer !== undefined) {
    running.push({ ...lesson.timer, name: lesson.title, fresh: true });
  }
  return `<div class="kit-timers">${running
    .map((timer) => {
      const left = chipTime(timer.ms);
      return `<button type="button" class="kit-timer${timer.fresh === true ? " is-fresh" : ""}" data-tap="${esc(tap(`Shows the name, ${timer.name}, ${timer.times} for ${left}.`))}" aria-label="${esc(`${timer.name} ${timer.times} ${left}`)}">${icon(timer.art)}<span class="kit-timer-times">${esc(timer.times)}</span><span class="kit-timer-left">${esc(left)}</span></button>`;
    })
    .join("")}</div>`;
}

function bar(lesson: Lesson, step: TeachStep): string {
  const items = [
    ["buys", ART.cart, "Buys"],
    ["workshop", ART.hammer, "Workshop"],
    ["engineers", ART.map, "Engineers"],
    ["upgrades", ART.upgrades, "Upgrades"],
  ] as const;
  return `<nav class="teach-bar">${items
    .map(([id, art, label]) => {
      const dot = id === lesson.bar && step === "note";
      return `<button type="button" class="kit-btn kit-secondary kit-bar${dot ? " is-new" : ""}" data-bar="${id}" data-tap="${esc(tap(`Opens ${label}.`))}">${icon(art)}<span>${esc(label)}</span>${dot ? `<span class="kit-dot" aria-label="Something new"></span>` : ""}</button>`;
    })
    .join("")}</nav>`;
}

function card(
  lesson: Lesson,
  spec: SheetCard,
  mode: "plain" | "guide" | "done",
  option: TeachOption,
): string {
  const isTarget = spec.id === lesson.target;
  const guide = isTarget && mode === "guide";
  const done = isTarget && mode === "done";
  const action =
    spec.dear === true
      ? `Not enough yet, so ${spec.name} waits.`
      : `Starts ${spec.name} for ${spec.price}.`;
  const tag = guide
    ? `<span class="teach-tag">${option === "b" ? "New" : "Start here"}</span>`
    : done
      ? `<span class="teach-tag is-done">On now</span>`
      : "";
  return `<button type="button" class="card kit-card${spec.dear === true ? " is-dear" : ""}${guide ? " is-guide" : ""}${done ? " is-done" : ""}" data-card="${spec.id}" data-tap="${esc(tap(action))}"${spec.dear === true ? " disabled" : ""}>
    ${icon(spec.art)}
    <span class="kit-card-body">
      <span class="kit-card-head"><span class="kit-card-title">${esc(spec.name)}</span>${tag}</span>
      <span class="kit-card-price teach-price">${esc(spec.price)}</span>
      <span class="kit-card-line">${esc(done ? lesson.payoff : spec.line)}</span>
    </span>
  </button>`;
}

function infoButton(lesson: Lesson): string {
  return `<button type="button" class="kit-btn kit-outline kit-info" data-info="1" data-tap="${esc(tap(`Opens How it works for ${lesson.sheet}.`))}" aria-label="How it works">i</button>`;
}

function sheet(
  lesson: Lesson,
  option: TeachOption,
  mode: "plain" | "guide" | "done",
  intro = "",
): string {
  const ordered =
    option === "b" && mode !== "plain"
      ? [...lesson.cards].sort((left) => (left.id === lesson.target ? -1 : 1))
      : lesson.cards;
  return `<section class="card teach-sheet" role="dialog" aria-label="${esc(lesson.sheet)}">
    <header class="teach-sheet-head"><h2 class="kit-title">${esc(lesson.sheet)}</h2>${infoButton(lesson)}</header>
    ${intro}
    <div class="kit-stack">${ordered.map((spec) => card(lesson, spec, mode, option)).join("")}</div>
  </section>`;
}

function howSteps(lesson: Lesson): string {
  return `<ul class="kit-steps">${lesson.how
    .map(
      ([art, text]) =>
        `<li class="kit-step">${icon(art)}<span>${esc(text)}</span></li>`,
    )
    .join("")}</ul>`;
}

function howCard(lesson: Lesson, head: string): string {
  return `<article class="card kit-how teach-how" role="dialog" aria-label="How it works">
    <header class="kit-how-head">${head}<h2 class="kit-title">How it works · ${esc(lesson.sheet === "Workshop" && lesson.art === ART.ore ? "Ore" : lesson.sheet)}</h2></header>
    ${howSteps(lesson)}
    <button type="button" class="kit-btn kit-primary kit-wide" data-tap="${esc(tap("The card closes back to the sheet."))}">Got it</button>
  </article>`;
}

function noteLine(lesson: Lesson): string {
  return `<button type="button" class="card kit-notice teach-note" data-tap="${esc(tap(`Opens ${lesson.sheet} on the new thing.`))}">${icon(lesson.art)}<span>${esc(lesson.note)}</span></button>`;
}

function payoffLine(lesson: Lesson): string {
  return `<p class="card kit-notice teach-payoff" role="status">${icon(lesson.art)}<span>${esc(lesson.payoff)}</span></p>`;
}

function rock(): string {
  return `<img class="teach-rock" src="${ART.mountain}" alt="" />`;
}

function frame(
  lesson: Lesson,
  step: TeachStep,
  middle: string,
  below = "",
): string {
  return `<section class="kit-screen teach-screen">
    <p class="card teach-pocket">${icon(ART.stone)}<span>${esc(formatCompact(712_000))} stones</span></p>
    ${timers(lesson, step)}
    <div class="teach-middle">${middle}</div>
    ${below}
    ${bar(lesson, step)}
  </section>`;
}

/** A · Card: badge and note, a reveal card, a highlighted card, a notice, the shared How card. */
function optionA(lesson: Lesson, step: TeachStep): string {
  switch (step) {
    case "note":
      return frame(lesson, step, rock(), noteLine(lesson));
    case "reveal":
      return frame(
        lesson,
        step,
        `${rock()}<div class="teach-scrim"></div><article class="card teach-reveal" role="dialog" aria-label="${esc(lesson.title)}">
          <header class="kit-how-head">${icon(lesson.art, " is-big")}<h2 class="kit-title">${esc(lesson.title)}</h2></header>
          ${lesson.lines.map((line) => `<p class="teach-line">${esc(line)}</p>`).join("")}
          <button type="button" class="kit-btn kit-primary kit-wide" data-tap="${esc(tap(`${lesson.action}. The sheet opens with that card lit.`))}">${esc(lesson.action)}</button>
          <button type="button" class="kit-btn kit-outline kit-wide" data-tap="${esc(tap("The card closes. The dot stays until the sheet is opened."))}">Later</button>
        </article>`,
      );
    case "guide":
      return frame(lesson, step, sheet(lesson, "a", "guide"));
    case "payoff":
      return frame(
        lesson,
        step,
        sheet(lesson, "a", "plain"),
        payoffLine(lesson),
      );
    case "how":
      return frame(lesson, step, howCard(lesson, icon(lesson.art, " is-big")));
  }
}

/** B · In the sheet: the badge only; the sheet opens on the new card with a one-line intro. */
function optionB(lesson: Lesson, step: TeachStep): string {
  const intro = `<p class="teach-intro">${icon(lesson.art)}<span>${esc(lesson.lines.join(" "))}</span></p>`;
  switch (step) {
    case "note":
      return frame(lesson, step, rock());
    case "reveal":
      return frame(lesson, step, sheet(lesson, "b", "guide", intro));
    case "guide":
      return frame(lesson, step, sheet(lesson, "b", "guide"));
    case "payoff":
      return frame(lesson, step, sheet(lesson, "b", "done"));
    case "how":
      return frame(
        lesson,
        step,
        `<section class="card teach-sheet" role="dialog" aria-label="${esc(lesson.sheet)}">
          <header class="teach-sheet-head"><h2 class="kit-title">How it works</h2></header>
          ${howSteps(lesson)}
          <button type="button" class="kit-btn kit-outline kit-wide" data-tap="${esc(tap(`Back to the ${lesson.sheet} list.`))}">Back to ${esc(lesson.sheet)}</button>
        </section>`,
      );
  }
}

function bubble(text: string, button = ""): string {
  return `<div class="card teach-bubble" role="status">${icon(ART.helper, " is-big")}<div class="teach-bubble-body"><p class="teach-line">${esc(text)}</p>${button}</div></div>`;
}

/** C · Foreman: the old miner speaks one line at a time, then points. */
function optionC(lesson: Lesson, step: TeachStep): string {
  switch (step) {
    case "note":
      return frame(
        lesson,
        step,
        rock(),
        bubble(
          lesson.foreman.note,
          `<button type="button" class="kit-btn kit-primary" data-tap="${esc(tap(`Opens ${lesson.sheet} with the foreman beside it.`))}">Show me</button>`,
        ),
      );
    case "reveal":
      return frame(
        lesson,
        step,
        rock(),
        bubble(
          lesson.lines.join(" "),
          `<button type="button" class="kit-btn kit-primary kit-wide" data-tap="${esc(tap(`${lesson.action}.`))}">${esc(lesson.action)}</button>`,
        ),
      );
    case "guide":
      return frame(
        lesson,
        step,
        sheet(lesson, "c", "guide"),
        bubble("This one. Tap the lit card."),
      );
    case "payoff":
      return frame(lesson, step, rock(), bubble(lesson.foreman.payoff));
    case "how":
      return frame(lesson, step, howCard(lesson, icon(ART.helper, " is-big")));
  }
}

export function renderTeach(option: TeachOption, control: string): string {
  const [systemId, stepId] = control.split("-");
  const system = TEACH_SYSTEMS.find((id) => id === systemId);
  const step = TEACH_STEPS.find((id) => id === stepId);
  if (system === undefined || step === undefined) {
    throw new Error(`Unknown teach shot ${control}`);
  }
  const lesson = LESSONS[system];
  switch (option) {
    case "a":
      return optionA(lesson, step);
    case "b":
      return optionB(lesson, step);
    case "c":
      return optionC(lesson, step);
  }
}
