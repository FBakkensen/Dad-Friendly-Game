import {
  canPromote,
  nextEngineerName,
  onDuty,
  promoteCost,
  type Duty,
  type DutyEngineer,
  type EngineerName,
} from "./engineers";
import { TUNNELS } from "./expeditions";
import { formatCompact } from "./format";
import type { Trouble } from "./hazards";
import type { Mountain } from "./mountain";
import {
  firstTend,
  moveGain,
  promotePayoff,
  tendingGain,
  type TendTier,
} from "./rates";
import type { RowLamp, RowState, RowView } from "./row-view";
import { showsDot } from "./teach";
import { owned, tierById } from "./tiers";
import {
  BROUGHT_HOME,
  ENGINEERS_BACK,
  ENGINEER_SHEET_SUB,
  NONE_BUILT,
  PROMOTE_BUTTON,
  PROMOTE_CREW_FULL,
  PROMOTE_NEEDS_WORKER,
  PROMOTE_TITLE,
  PROMOTE_WHY,
  PROMOTION_INTRO,
  SEND_EXPLORING,
  broughtHomeNames,
  callBackLabel,
  dutyLine,
  dutySentence,
  engineersIntro,
  exploreAside,
  exploreBenefit,
  exploreTitle,
  firstTripWords,
  keepsakeWords,
  keepsakesBroughtHome,
  promoteConfirm,
  promoteNeeds,
  promoteOffer,
  promotionPayoff,
  rankHint,
  rankLabel,
  stonesPerSecond,
  tendBenefit,
  tendTitle,
  tendingIntro,
  tripDetail,
  tunnelLock,
  type TendPost,
} from "./screen-words";

/*
 * The Engineers drawer's rules as views (#455): its rows, the page it shows, the kick, and
 * which row is the New one. Pure: it reads the mountain and the words, and draws nothing.
 * engineer-parts.ts paints these; the panel only says what a tap does.
 */

/** A machine post an engineer can tend. */
type MachinePost = Exclude<TendPost, "camp">;

/** One tunnel of the three. */
type Tunnel = (typeof TUNNELS)[number];

/**
 * What the drawer shows in its list's place. A page names its engineer, never her index, so a
 * crew that changes under it never shows another engineer's posts.
 */
export type EngineerPage =
  | { readonly kind: "list" }
  | { readonly kind: "engineer"; readonly name: EngineerName }
  | { readonly kind: "tunnels"; readonly name: EngineerName }
  | { readonly kind: "recall"; readonly name: EngineerName }
  | { readonly kind: "promote"; readonly price: number }
  | { readonly kind: "brought" };

/** What a view reads: the mountain now, its trouble, the clock, and whether the save is in. */
export interface EngineerCtx {
  readonly mountain: Mountain;
  readonly trouble: Trouble | undefined;
  readonly now: number;
  readonly ready: boolean;
}

/** The first visit's lesson, one at a time (#246): the first trip, the first tend, a promotion. */
export type EngineerTeach =
  | { readonly kind: "trip"; readonly name: EngineerName }
  | {
      readonly kind: "tend";
      readonly name: EngineerName;
      readonly index: number;
      readonly post: MachinePost;
    }
  | {
      readonly kind: "promote";
      readonly name: string;
      readonly post: MachinePost;
      readonly gain: string;
    }
  | { readonly kind: "none" };

/** An engineer's list row, and whether she is out (her row walks home). */
export type EngineerRowView = RowView & { readonly out: boolean };

/** The Promote row, and the price it shows (Step up pays it, #367). */
export type PromoteRowView = RowView & { readonly cost: number };

/** One plate on her page: its control id, its words longest first, and the New look. */
interface PlateView {
  readonly id: "explore" | "recall" | "back";
  /** Its words, longest first: the first that fits the plate shows. */
  readonly label: readonly string[];
  /** The New flag of the guided first trip, else none. */
  readonly flag: readonly string[];
}

export interface HerPlates {
  readonly left: PlateView;
  /** The way back, or none while the guided first trip takes the plate row. */
  readonly right: PlateView | undefined;
}

const NEW_FLAG: readonly string[] = ["New"];
const NO_FLAG: readonly string[] = [];
const LIST: EngineerPage = { kind: "list" };

/** What a row says when it says nothing more. */
const QUIET_ROW = {
  badge: "",
  need: "",
  why: "",
  flag: NO_FLAG,
  gain: "",
  price: "",
  dimTag: false,
  verb: "",
  pick: false,
  can: true,
} as const satisfies Partial<RowView>;

/** The machine an engineer's post tends, or undefined at camp or in a tunnel. */
export function machinePost(post: Duty): MachinePost | undefined {
  switch (post) {
    case "cart":
    case "drill":
    case "borer":
    case "machine":
      return post;
    case "camp":
    case "tunnel":
      return undefined;
  }
}

/** Why a promotion waits (a full crew, no free worker, a light pocket), or why it is worth it. */
export function promoteWhyLine(
  current: Mountain,
  nameFree: boolean,
  cost: number,
): string {
  if (!nameFree) {
    return PROMOTE_CREW_FULL;
  }
  if (current.helpers < 1) {
    return PROMOTE_NEEDS_WORKER;
  }
  return current.pocket < cost ? promoteNeeds(cost) : PROMOTE_WHY;
}

/** The crew now, in its order: none before the first borer. Away reads "tunnel". */
export function crewOf(mountain: Mountain): readonly DutyEngineer[] {
  return onDuty(mountain);
}

/** The engineer of that name in the crew now, and her place in it; none for no name. */
export function findHer(
  mountain: Mountain,
  name: EngineerName | undefined,
): { readonly engineer: DutyEngineer; readonly index: number } | undefined {
  const engineers = crewOf(mountain);
  const index = engineers.findIndex((each) => each.name === name);
  const engineer = engineers[index];
  return engineer === undefined ? undefined : { engineer, index };
}

/** The engineer a page is about: hers, her tunnels and her recall; none for the others. */
export function pageEngineer(page: EngineerPage): EngineerName | undefined {
  return "name" in page ? page.name : undefined;
}

/** The price the promote ask was opened at (#367); NaN on any other page, which buys nothing. */
export function askedPrice(page: EngineerPage): number {
  return page.kind === "promote" ? page.price : Number.NaN;
}

/** The promote ask's line: who steps up, or nothing for a full crew. */
export function promoteAskLine(mountain: Mountain): string {
  const next = nextEngineerName(mountain.engineers);
  return next === undefined ? "" : promoteConfirm(next);
}

/** Her trip on the books, as the duty line counts it: where, and how long is left. */
function tripOf(
  ctx: EngineerCtx,
  name: EngineerName,
): { readonly tunnel: Tunnel["id"]; readonly leftMs: number } | undefined {
  const trip = ctx.mountain.expeditions.find((each) => each.engineer === name);
  return trip === undefined
    ? undefined
    : { tunnel: trip.tunnel, leftMs: trip.returnsAt - ctx.now };
}

/** A page whose subject changed under it gives way; one still true stays (Review Focus 2). */
function settleHers(
  page: Extract<EngineerPage, { readonly name: EngineerName }>,
  mountain: Mountain,
): EngineerPage {
  const her = findHer(mountain, page.name);
  if (her === undefined) {
    return LIST;
  }
  const out = her.engineer.post === "tunnel";
  const gone =
    (page.kind === "recall" && !out) || (page.kind === "tunnels" && out);
  return gone ? { kind: "engineer", name: page.name } : page;
}

/** The page the drawer can still show. Until the save is in, the page stays. */
export function settlePage(
  page: EngineerPage,
  mountain: Mountain,
  ready: boolean,
): EngineerPage {
  if (!ready) {
    return page;
  }
  switch (page.kind) {
    case "list":
      return page;
    case "engineer":
    case "tunnels":
    case "recall":
      return settleHers(page, mountain);
    case "promote":
      return canPromote(mountain) ? page : LIST;
    case "brought":
      return keepsakesBroughtHome(mountain.finds).length > 0 ? page : LIST;
  }
}

/** What tending that post would make, in words: none for camp, the reason for none built. */
export function postGain(
  ctx: EngineerCtx,
  index: number,
  post: TendPost,
): string | undefined {
  if (post === "camp") {
    return undefined;
  }
  const { mountain, now, trouble } = ctx;
  return owned(mountain, tierById(post)) === 0
    ? NONE_BUILT
    : stonesPerSecond(tendingGain(mountain, index, post, now, trouble));
}

/** What moving her to that machine gains the crew, in words: what she makes there less what she leaves. */
function netGain(ctx: EngineerCtx, index: number, post: TendTier): string {
  const { mountain, now, trouble } = ctx;
  return stonesPerSecond(moveGain(mountain, index, post, now, trouble));
}

/** The first tend's lesson, once the trip is taught. */
function tendTeach(ctx: EngineerCtx): EngineerTeach | undefined {
  const { mountain, now, trouble } = ctx;
  const step = showsDot(mountain, "tending")
    ? firstTend(mountain, now, trouble)
    : undefined;
  const tender = step === undefined ? undefined : crewOf(mountain)[step.index];
  return step === undefined || tender === undefined
    ? undefined
    : { kind: "tend", name: tender.name, index: step.index, post: step.post };
}

/** The promotion's lesson: the new hand, the post it would take, and its real gain. */
function promoteTeach(ctx: EngineerCtx): EngineerTeach | undefined {
  const { mountain, now, trouble } = ctx;
  const payoff = showsDot(mountain, "promotion")
    ? promotePayoff(mountain, now, trouble)
    : undefined;
  return payoff === undefined
    ? undefined
    : {
        kind: "promote",
        name: payoff.name,
        post: payoff.post,
        gain: stonesPerSecond(payoff.gain),
      };
}

/**
 * Today's lesson chain: the first trip while the first engineer is home and it is untaught,
 * else the first tend, else the promotion, else none.
 */
export function engineerTeach(ctx: EngineerCtx): EngineerTeach {
  const first = crewOf(ctx.mountain)[0];
  if (
    first !== undefined &&
    first.post !== "tunnel" &&
    showsDot(ctx.mountain, "engineers")
  ) {
    return { kind: "trip", name: first.name };
  }
  return tendTeach(ctx) ?? promoteTeach(ctx) ?? { kind: "none" };
}

/** The list's kick: the lesson's intro, else the sheet's sub-line. */
export function listKick(teach: EngineerTeach): string {
  switch (teach.kind) {
    case "trip":
      return engineersIntro(teach.name);
    case "tend":
      return tendingIntro(teach.name);
    case "promote":
      return PROMOTION_INTRO;
    case "none":
      return ENGINEER_SHEET_SUB;
  }
}

/** Her page's kick: her duty with its live gain at home, the trip in words while out. */
function herKick(
  ctx: EngineerCtx,
  engineer: DutyEngineer,
  index: number,
): string {
  const trip = tripOf(ctx, engineer.name);
  if (trip !== undefined) {
    return tripDetail(engineer.name, trip.leftMs);
  }
  const machine = machinePost(engineer.post);
  return dutySentence(
    engineer,
    machine === undefined ? undefined : postGain(ctx, index, machine),
  );
}

/** The kick for the page shown: hers, the tunnels' aside, else the list's. */
export function pageKick(
  page: EngineerPage,
  ctx: EngineerCtx,
  teach: EngineerTeach,
): string {
  if (page.kind !== "engineer" && page.kind !== "tunnels") {
    return listKick(teach);
  }
  const engineers = crewOf(ctx.mountain);
  const index = engineers.findIndex((each) => each.name === page.name);
  const engineer = engineers[index];
  if (engineer === undefined) {
    return listKick(teach);
  }
  return page.kind === "tunnels"
    ? exploreAside(engineer.name, engineer.post)
    : herKick(ctx, engineer, index);
}

/** The teach names her: her first trip, or her first tend. */
function teachNames(teach: EngineerTeach, name: EngineerName): boolean {
  return (
    (teach.kind === "trip" || teach.kind === "tend") && teach.name === name
  );
}

/** Green while tending or out, off at camp. */
function dutyLook(post: Duty): {
  readonly lamp: RowLamp;
  readonly state: RowState;
} {
  if (post === "camp") {
    return { lamp: "off", state: "ready" };
  }
  return { lamp: "green", state: post === "tunnel" ? "running" : "owned" };
}

/** One engineer's row on the list: her name, her rank in words, and her duty. */
export function engineerRowView(
  engineer: DutyEngineer,
  ctx: EngineerCtx,
  teach: EngineerTeach,
): EngineerRowView {
  const duty = dutyLine(engineer, tripOf(ctx, engineer.name));
  const rank = rankLabel(engineer.rank);
  const isNew = teachNames(teach, engineer.name);
  const look = dutyLook(engineer.post);
  return {
    ...QUIET_ROW,
    name: engineer.name,
    badge: rank,
    info: [duty, dutyLine(engineer)],
    why: rankHint(engineer) ?? "",
    flag: isNew ? NEW_FLAG : NO_FLAG,
    lamp: isNew ? "amber" : look.lamp,
    state: look.state,
    aria: `${engineer.name}. ${rank}. ${duty}`,
    out: engineer.post === "tunnel",
  };
}

/** One post on her page: here now, or what tending it would make. */
export function postRowView(
  engineer: DutyEngineer,
  index: number,
  post: TendPost,
  ctx: EngineerCtx,
  teach: EngineerTeach,
): RowView {
  const here = engineer.post === post;
  const guided =
    !here &&
    teach.kind === "tend" &&
    teach.name === engineer.name &&
    teach.post === post
      ? teach.post
      : undefined;
  const isNew = guided !== undefined;
  // The guided tend reads the move's net gain, as today's guided button did (#246).
  const gain =
    guided === undefined
      ? postGain(ctx, index, post)
      : netGain(ctx, index, guided);
  const name = tendTitle(post, here);
  const benefit = tendBenefit(post, engineer.name, gain);
  return {
    ...QUIET_ROW,
    name,
    info: [benefit, tendBenefit(post, engineer.name)],
    // Her own post's gain is the page's kick (her duty), so the name keeps the row's width.
    gain: here || gain === undefined || gain === NONE_BUILT ? "" : gain,
    flag: isNew ? NEW_FLAG : NO_FLAG,
    lamp: here ? "green" : isNew ? "amber" : "off",
    state: here ? "owned" : "ready",
    aria: `${name}. ${benefit}`,
  };
}

/** One tunnel on the tunnels page: what it brings, or why her rank cannot lead it. */
export function tunnelRowView(
  engineer: DutyEngineer,
  tunnel: Tunnel,
  teach: EngineerTeach,
): RowView {
  const lock = tunnelLock(engineer.rank, tunnel.id);
  const info = lock ?? exploreBenefit(tunnel.id);
  const name = exploreTitle(tunnel.id);
  const isNew =
    lock === undefined &&
    teach.kind === "trip" &&
    teach.name === engineer.name &&
    tunnel.id === TUNNELS[0].id;
  return {
    ...QUIET_ROW,
    name,
    info: [info],
    flag: isNew ? NEW_FLAG : NO_FLAG,
    lamp: isNew ? "amber" : "off",
    state: lock === undefined ? "ready" : "locked",
    can: lock === undefined,
    aria: `${name}. ${info}`,
  };
}

/** A full crew keeps the Promote row, with no tag and no verb. */
function fullCrewRow(cost: number): PromoteRowView {
  return {
    ...QUIET_ROW,
    name: PROMOTE_TITLE,
    info: [PROMOTE_CREW_FULL],
    lamp: "off",
    state: "locked",
    can: false,
    aria: `${PROMOTE_TITLE}. ${PROMOTE_CREW_FULL}`,
    cost,
  };
}

/** The Promote row, a buy row: its price, its verb, and why, or the payoff under the teach. */
export function promoteRowView(
  ctx: EngineerCtx,
  teach: EngineerTeach,
): PromoteRowView {
  const { mountain } = ctx;
  const cost = promoteCost(mountain);
  if (nextEngineerName(mountain.engineers) === undefined) {
    return fullCrewRow(cost);
  }
  const promotable = canPromote(mountain);
  const line =
    teach.kind === "promote"
      ? promotionPayoff(teach.name, teach.post, teach.gain)
      : promoteWhyLine(mountain, true, cost);
  const isNew = teach.kind === "promote";
  return {
    ...QUIET_ROW,
    name: PROMOTE_TITLE,
    info: [line],
    flag: isNew ? NEW_FLAG : NO_FLAG,
    price: formatCompact(cost),
    dimTag: !promotable,
    verb: PROMOTE_BUTTON,
    lamp: isNew ? "amber" : promotable ? "green" : "off",
    state: promotable ? "ready" : "dear",
    can: ctx.ready && promotable,
    aria: `${promoteOffer(cost)}. ${line}`,
    cost,
  };
}

/** Brought home: one row of today's keepsake names, or none without keepsakes. */
export function broughtRowView(finds: Mountain["finds"]): RowView | undefined {
  const ids = keepsakesBroughtHome(finds);
  if (ids.length === 0) {
    return undefined;
  }
  const names = broughtHomeNames(ids);
  return {
    ...QUIET_ROW,
    name: BROUGHT_HOME,
    info: [names],
    lamp: "off",
    state: "found",
    aria: `${BROUGHT_HOME}. ${names}`,
  };
}

/** Each keepsake's story, one line each, in the order they came home. */
export function broughtStories(finds: Mountain["finds"]): readonly string[] {
  return keepsakesBroughtHome(finds).map((id) => {
    const words = keepsakeWords(id);
    return `${words.name}. ${words.story}`;
  });
}

/**
 * Her page's plates: Send exploring or Call her back, and the way back. The guided first trip,
 * New, takes the whole plate row under its teach; the shell's own Back stays.
 */
export function herPlates(
  engineer: DutyEngineer,
  teach: EngineerTeach,
): HerPlates {
  const right: PlateView = {
    id: "back",
    label: [ENGINEERS_BACK],
    flag: NO_FLAG,
  };
  if (engineer.post === "tunnel") {
    return {
      left: {
        id: "recall",
        label: [callBackLabel(engineer.name)],
        flag: NO_FLAG,
      },
      right,
    };
  }
  if (teach.kind === "trip" && teach.name === engineer.name) {
    return {
      left: {
        id: "explore",
        label: [
          firstTripWords(engineer.name, TUNNELS[0].awayMs),
          SEND_EXPLORING,
        ],
        flag: NEW_FLAG,
      },
      right: undefined,
    };
  }
  return {
    left: { id: "explore", label: [SEND_EXPLORING], flag: NO_FLAG },
    right,
  };
}
