import { formatCompact } from "./format";
import { GOOD_NAMES, GOOD_WORDS } from "./frame-view";
import type { KeyPricePart } from "./mine-site";
import type { Mountain } from "./mountain";
import type { Lamp } from "./next-view";
import {
  RESEARCH_PROJECTS,
  researchById,
  researchDone,
  researchOpen,
  researchPrice,
  researchReady,
  type ResearchId,
} from "./research";
import type { GoodId } from "./stock";

/**
 * Pure view model for the City's Research Lab door and Research sheet
 * (Slice 2 Part 2, #779; spec rule 4.3 & "What he sees").
 * One active project at a time, delivered physically by Transport, lossless
 * cancel refund, and manual Install. Never writes the mountain.
 */

const RESEARCH_SUBTITLE =
  "One project at a time. Transport delivers the goods.";

export type ResearchDoorView = {
  readonly open: boolean;
  readonly doneCount: number;
  readonly totalCount: number;
  readonly lamp: Lamp;
  readonly status: string;
  readonly label: string;
};

export type ResearchGoodProgress = {
  readonly good: GoodId;
  readonly name: string;
  readonly arrived: number;
  readonly required: number;
  readonly text: string;
  readonly fill: number;
};

export type ResearchCardView =
  | {
      readonly status: "done";
      readonly id: ResearchId;
      readonly name: string;
      readonly summary: string;
    }
  | {
      readonly status: "ready";
      readonly id: ResearchId;
      readonly name: string;
      readonly summary: string;
      readonly goods: readonly ResearchGoodProgress[];
      readonly actionLabel: string;
    }
  | {
      readonly status: "delivering";
      readonly id: ResearchId;
      readonly name: string;
      readonly summary: string;
      readonly goods: readonly ResearchGoodProgress[];
      readonly actionLabel: string;
    }
  | {
      readonly status: "available";
      readonly id: ResearchId;
      readonly name: string;
      readonly summary: string;
      readonly price: readonly KeyPricePart[];
      readonly canStart: boolean;
      readonly actionLabel: string;
    };

export type ResearchSheetView = {
  readonly title: "Research Lab";
  readonly subtitle: string;
  readonly doneCount: number;
  readonly totalCount: number;
  readonly cards: readonly ResearchCardView[];
};

function countDone(mountain: Mountain): number {
  return RESEARCH_PROJECTS.filter((project) =>
    researchDone(mountain, project.id),
  ).length;
}

/** City screen Research Lab door button view (hidden until Building 4 is operational under Part 2). */
export function researchDoorView(mountain: Mountain): ResearchDoorView {
  const totalCount = RESEARCH_PROJECTS.length;
  const doneCount = countDone(mountain);
  if (!researchOpen(mountain)) {
    return {
      open: false,
      doneCount,
      totalCount,
      lamp: "dark",
      status: "",
      label: "",
    };
  }
  const active = mountain.research.active;
  if (active !== undefined) {
    const project = researchById(active.id);
    const ready = researchReady(active);
    const status = ready
      ? `Ready to install: ${project.name}`
      : `Delivering: ${project.name}`;
    return {
      open: true,
      doneCount,
      totalCount,
      lamp: ready ? "green" : "amber",
      status,
      label: `Research Lab, ${String(doneCount)} of ${String(totalCount)} installed. ${status}. Opens Research.`,
    };
  }
  const status =
    doneCount >= totalCount ? "All projects installed" : "Choose a project";
  return {
    open: true,
    doneCount,
    totalCount,
    lamp: "dark",
    status,
    label: `Research Lab, ${String(doneCount)} of ${String(totalCount)} installed. ${status}. Opens Research.`,
  };
}

function progressGoods(
  id: ResearchId,
  arrived: Mountain["stock"],
): readonly ResearchGoodProgress[] {
  return researchPrice(id).map((line): ResearchGoodProgress => {
    const got = Math.min(line.amount, arrived[line.good]);
    return {
      good: line.good,
      name: GOOD_NAMES[line.good],
      arrived: got,
      required: line.amount,
      text: `${formatCompact(got)} of ${formatCompact(line.amount)}`,
      fill: line.amount > 0 ? Math.min(1, got / line.amount) : 1,
    };
  });
}

function projectCardView(mountain: Mountain, id: ResearchId): ResearchCardView {
  const project = researchById(id);
  if (researchDone(mountain, id)) {
    return {
      status: "done",
      id,
      name: project.name,
      summary: project.summary,
    };
  }
  const active = mountain.research.active;
  if (active !== undefined && active.id === id) {
    const goods = progressGoods(id, active.arrived);
    if (researchReady(active)) {
      return {
        status: "ready",
        id,
        name: project.name,
        summary: project.summary,
        goods,
        actionLabel: `Install ${project.name}`,
      };
    }
    return {
      status: "delivering",
      id,
      name: project.name,
      summary: project.summary,
      goods,
      actionLabel: `Cancel ${project.name} and refund arrived goods`,
    };
  }
  const price: readonly KeyPricePart[] = researchPrice(id).map((line) => ({
    good: line.good,
    text: formatCompact(line.amount),
  }));
  const costWords = price
    .map((part) => `${part.text} ${GOOD_WORDS[part.good]}`)
    .join(" and ");
  return {
    status: "available",
    id,
    name: project.name,
    summary: project.summary,
    price,
    canStart: active === undefined,
    actionLabel: `Start ${project.name}. Requires ${costWords}.`,
  };
}

const STATUS_ORDER: Readonly<Record<ResearchCardView["status"], number>> = {
  ready: 0,
  delivering: 1,
  available: 2,
  done: 3,
};

/** Complete view model for the Research sheet. */
export function researchSheetView(mountain: Mountain): ResearchSheetView {
  const totalCount = RESEARCH_PROJECTS.length;
  const doneCount = countDone(mountain);
  const cards = RESEARCH_PROJECTS.map((project) =>
    projectCardView(mountain, project.id),
  ).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return {
    title: "Research Lab",
    subtitle: RESEARCH_SUBTITLE,
    doneCount,
    totalCount,
    cards,
  };
}
