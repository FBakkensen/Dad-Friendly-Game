/* global document, getComputedStyle, HTMLElement, Image, requestAnimationFrame */
/** The board's measures: what the board, bay and drawer sections read off the page. */
import {
  targetsCloserThan,
  contrastRatio,
} from "../../src/ui-audit-measure.ts";
import { OPEN_SHEET } from "./kit.mjs";

/** The drawer's own module, as the dev server serves it: the spare's tiers. */
const DRAWER_UI = "/src/board-drawer.ts";

/**
 * An open drawer measured in board px (#373): its box, what it leaves in view,
 * its list and spare plate, and each shown row with its parts. A row's name,
 * info, need, why, flag, gain, tag and verb must lie inside it and apart.
 */
async function drawerFacts(page, name) {
  return page.evaluate(
    async (selector, ui) => {
      const { spareTier } = await import(ui);
      const board = globalThis.__board();
      const sheet = document.querySelector(selector);
      if (sheet === null) {
        return { ok: false, missing: selector };
      }
      const px = (rect) => ({
        l: (rect.left - board.left) / board.scale,
        t: (rect.top - board.top) / board.scale,
        r: (rect.right - board.left) / board.scale,
        b: (rect.bottom - board.top) / board.scale,
      });
      const near = (a, b) => Math.abs(a - b) <= 0.5;
      const box = px(sheet.getBoundingClientRect());
      const placed =
        near(box.t, 178) &&
        near(box.b, 864) &&
        near(box.l, 8) &&
        near(box.r, 416);
      // What a finger meets at the centre of the odometer and the save line.
      const sheetBox = sheet.getBoundingClientRect();
      const reach = (part, clear) => {
        const el = document.querySelector(part);
        if (el === null) {
          return false;
        }
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          (b.left + b.right) / 2,
          (b.top + b.bottom) / 2,
        );
        // The scrim over the board is clear: it shows what is under it.
        return (
          hit !== null &&
          (el.contains(hit) || hit.classList.contains("board-scrim")) &&
          clear(b)
        );
      };
      const odometerClear = reach(
        ".board-odo",
        (b) => b.bottom <= sheetBox.top + 0.5,
      );
      const saveLineClear = reach(
        ".board-saveline",
        (b) => b.top >= sheetBox.bottom - 0.5,
      );
      const list = sheet.querySelector(".board-sheet-list");
      const spare = sheet.querySelector(".board-spare");
      const scrolls =
        list !== null && list.scrollHeight > list.clientHeight + 1;
      const spareClass =
        spare === null
          ? ""
          : ([...spare.classList].find((cls) =>
              ["is-tall", "is-mid", "is-short", "is-off"].includes(cls),
            ) ?? "");
      // Off, the plate gives the list's gap back, so it is measured without that room, as
      // the drawer measures it.
      const freed =
        spare !== null && list !== null && spare.classList.contains("is-off")
          ? Number.parseFloat(getComputedStyle(list).rowGap) || 0
          : 0;
      const spareWant =
        spare === null ? "" : `is-${spareTier(spare.offsetHeight - freed)}`;
      const shown = (el) =>
        el.closest("[hidden]") === null && el.getClientRects().length > 0;
      const rows = [...sheet.querySelectorAll(".board-row")].filter(shown);
      const listBox = list?.getBoundingClientRect();
      const PARTS = [
        ".board-row-name",
        ".board-row-info",
        ".board-row-need",
        ".board-row-why",
        ".board-row-flag",
        ".board-row-gain",
        ".board-row-tag",
        ".board-row-verb",
      ];
      const rowFacts = rows.map((row) => {
        const r = px(row.getBoundingClientRect());
        const parts = PARTS.flatMap((part) =>
          [...row.querySelectorAll(part)]
            .filter((el) => shown(el) && (el.textContent ?? "").trim() !== "")
            .map((el) => ({ part, el, b: px(el.getBoundingClientRect()) })),
        );
        const inside = parts.every(
          ({ b }) =>
            b.l >= r.l - 0.5 &&
            b.r <= r.r + 0.5 &&
            b.t >= r.t - 0.5 &&
            b.b <= r.b + 0.5,
        );
        // The name keeps its whole width on its line: one too long runs past
        // the words' column, which clips it.
        const mid = row.querySelector(".board-row-mid");
        const nameEl = row.querySelector(".board-row-name");
        const nameFull =
          mid === null ||
          nameEl === null ||
          nameEl.getBoundingClientRect().right <=
            mid.getBoundingClientRect().right + 0.5;
        // A line that runs past its box is cut by an ellipsis inside it.
        const spills = parts
          .filter(({ el }) => el.scrollWidth > el.clientWidth + 1)
          .filter(({ el }) => getComputedStyle(el).textOverflow !== "ellipsis")
          .map(({ part }) => part);
        const overlaps = [];
        for (let i = 0; i < parts.length; i += 1) {
          for (let j = i + 1; j < parts.length; j += 1) {
            const a = parts[i].b;
            const b = parts[j].b;
            const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
            const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
            if (w > 0.5 && h > 0.5) {
              overlaps.push(`${parts[i].part}/${parts[j].part}`);
            }
          }
        }
        return {
          id:
            row.dataset.tier ??
            row.dataset.boost ??
            row.dataset.upgrade ??
            row.dataset.tool ??
            row.dataset.recipe ??
            // The Ledger's stones, relics and account rows (#375).
            row.dataset.ledger ??
            // The Engineers' rows, Brought home and Promote, posts and tunnels (#455).
            row.dataset.engineer ??
            row.dataset.engineers ??
            row.dataset.post ??
            row.dataset.tunnel ??
            (row.dataset.bench === undefined ? "" : "bench"),
          classes: [...row.classList].filter((cls) => cls.startsWith("is-")),
          top: r.t,
          bottom: r.b,
          height: r.b - r.t,
          width: r.r - r.l,
          words: parts.map(({ el }) => (el.textContent ?? "").trim()),
          inside: inside && nameFull,
          nameFull,
          spills,
          overlaps,
          inView:
            listBox !== undefined &&
            row.getBoundingClientRect().top >= listBox.top - 0.5 &&
            row.getBoundingClientRect().bottom <= listBox.bottom + 0.5,
        };
      });
      // Rows next to each other in the list stand 10 board px apart.
      const gaps = [];
      for (let i = 1; i < rows.length; i += 1) {
        let between = rows[i].previousElementSibling;
        while (between !== null && !shown(between)) {
          between = between.previousElementSibling;
        }
        if (between === rows[i - 1]) {
          gaps.push(
            Math.round((rowFacts[i].top - rowFacts[i - 1].bottom) * 10) / 10,
          );
        }
      }
      return {
        ok: true,
        box: [box.l, box.t, box.r, box.b].map(
          (side) => Math.round(side * 10) / 10,
        ),
        placed,
        odometerClear,
        saveLineClear,
        scrolls,
        spareClass,
        spareWant,
        rows: rowFacts,
        gaps,
      };
    },
    OPEN_SHEET(name),
    DRAWER_UI,
  );
}
/**
 * The board's own controls; the save drawer's buttons join when it is open.
 * The mine window and the vein are the gauge row's (#371). The keys on the
 * rail, and an open drawer's rows, plates and "i" (#373).
 */
const BOARD_TARGETS = [
  ".board-socket",
  ".board-dial",
  ".save-status",
  ".board-save-drawer.is-open .board-platebtn",
  ".board-note.on .board-platebtn",
  ".board-window",
  ".golden-vein",
  ".board-bay",
  ".board-ready",
  ".board-dig-button",
  ".board-key:not(:disabled)",
  ".board-sheet.is-open button.board-row:not([hidden])",
  ".board-sheet.is-open .board-platebtn",
  ".board-sheet.is-open .board-sheet-info",
  // A board card's plates (#464), and the conflict's two sides.
  ".board-card:not([hidden]) .board-card-plate",
  ".board-card:not([hidden]) .save-card",
].join(", ");
/** Every other control a finger can reach on the board at that moment. */
const NEIGHBOURS = "#app button, #app [role='button']";
/**
 * The bays' and the Ready row's words (#372): the band tag, each bay's name,
 * sub-line, price legend and price, the flap digits, the plate's three lines
 * and the red button's legend.
 */
const BAY_LEGENDS = [
  ".board-band .board-lg",
  ".board-bay-name",
  ".board-bay-sub",
  ".board-bay-price-lg",
  ".board-bay-tag-text",
  ".board-flap-d",
  ".board-ready-kick",
  ".board-ready-main",
  ".board-ready-why",
  ".board-dig-lg",
  ".board-dig-lg b",
];
/** A board card's words (#464): its title, lines, big number and plates. */
const CARD_LEGENDS = [
  ".board-card .board-card-title",
  ".board-card .board-card-line",
  ".board-card .board-card-big",
  ".board-card .welcome-ore-line",
  ".board-card .welcome-ore-use",
  ".board-card .board-platebtn-text",
];
/** Board text read against the board's art: the bars ask 4.5:1 of these. */
const BOARD_LEGENDS = [
  ".board-odo-legend .board-lg:not(.board-spend)",
  ".board-dial .board-lg",
  ".board-tag .board-lg",
  ".board-save-words",
  ".board-save-safe",
  ".board-save-why",
  // The gauge row (#371): Stones a sec, the crew plate, No. 2 Shaft and the
  // Legacy plate's words.
  ".board-gauge-legend",
  ".board-crew-legend",
  ".board-crew-n",
  ".board-crew-free",
  ".board-window-tag .board-lg",
  ".board-legacy .legacy-badge",
  ...BAY_LEGENDS,
  // The key rail (#373): each key's name and its unlock line or clock.
  ".board-key-name",
  ".board-key-sub",
  // A board card's words (#464).
  ...CARD_LEGENDS,
].join(", ");
/** The board's parts whose text and art the bars measure. */
const BOARD_PARTS =
  ".board-top, .board-gauge-row, .board-bays, .board-ready-row, .board-rail, .board-saveline, .board-save-drawer.is-open, .board-note.on, .board-sheet.is-open, .board-card:not([hidden])";
/** Parts whose every img and sprite is measured; a note's art is its skins. */
const BOARD_ART =
  ".board-top, .board-gauge-row, .board-bays, .board-ready-row, .board-rail, .board-saveline, .board-sheet.is-open, .board-card:not([hidden])";

/**
 * Visible controls in board px (rendered size / --board-scale): the board's
 * own, and the neighbours they must stand 8px from. A closed sheet, the
 * closed drawer and the parked note are not on screen, so they do not count.
 * With `vein` (a spot in the window's px, as veinSpot gives it) the golden
 * vein is shown there first, in the same page task as the measuring, so the
 * screen's second tick cannot hide it in between.
 */
async function boardTargets(page, { vein } = {}) {
  return page.evaluate(
    (own, neighbours, spot) => {
      if (spot !== null) {
        globalThis.__showVein(spot);
      }
      const board = globalThis.__board();
      const onScreen = (el) =>
        el.getClientRects().length > 0 &&
        el.closest("[hidden]") === null &&
        getComputedStyle(el).visibility !== "hidden";
      const measure = (el) => {
        const box = el.getBoundingClientRect();
        const name =
          el.getAttribute("aria-label") ??
          (el.textContent ?? "").replace(/\s+/g, " ").trim();
        return {
          selector: `.${el.classList[0] ?? el.tagName} ${name.slice(0, 24)}`,
          left: (box.left - board.left) / board.scale,
          top: (box.top - board.top) / board.scale,
          width: box.width / board.scale,
          height: box.height / board.scale,
        };
      };
      // A neighbour under the open drawer is out of reach, so it is skipped.
      const onTop = (el) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          (box.left + box.right) / 2,
          (box.top + box.bottom) / 2,
        );
        return hit !== null && (el.contains(hit) || hit.contains(el));
      };
      // So is one the open note or drawer lies over: it is beneath the
      // popup, which takes every tap there (an open note is pointer-events
      // auto), and the popup's own buttons are what a finger meets there.
      // That holds for the board's own controls too. A bay's thanks note is
      // pointer-events none (#372): taps pass through it, so a bay under it
      // is still in reach and still measured.
      const popupEls = [
        ...document.querySelectorAll(
          ".board-note.on, .board-save-drawer.is-open, .board-sheet.is-open, .board-card:not([hidden])",
        ),
      ].filter((popup) => getComputedStyle(popup).pointerEvents !== "none");
      const popups = popupEls.map((popup) => popup.getBoundingClientRect());
      const underPopup = (el) => {
        const box = el.getBoundingClientRect();
        return popups.some(
          (popup) =>
            box.left < popup.right &&
            box.right > popup.left &&
            box.top < popup.bottom &&
            box.bottom > popup.top,
        );
      };
      // A row scrolled out of an open drawer's list (C1) is out of reach until
      // the list brings it back, so only rows wholly in the list's view count.
      const inPort = (el) => {
        const list = el.closest(".board-sheet-list");
        if (list === null) {
          return true;
        }
        const box = el.getBoundingClientRect();
        const port = list.getBoundingClientRect();
        return box.top >= port.top - 0.5 && box.bottom <= port.bottom + 0.5;
      };
      const mine = [...document.querySelectorAll(own)].filter(
        (el) =>
          onScreen(el) &&
          inPort(el) &&
          (popupEls.some((popup) => popup.contains(el)) || !underPopup(el)),
      );
      const others = [...document.querySelectorAll(neighbours)].filter(
        (el) =>
          onScreen(el) &&
          inPort(el) &&
          onTop(el) &&
          !underPopup(el) &&
          !mine.includes(el),
      );
      return { own: mine.map(measure), others: others.map(measure) };
    },
    BOARD_TARGETS,
    NEIGHBOURS,
    vein ?? null,
  );
}

/**
 * The vein sits on the window as today's vein sat on the rock, so its gap to
 * the window is the one gap the bars do not ask for (#371).
 */
const veinOnWindow = (pair) =>
  [pair.a, pair.b].some((name) => name.startsWith(".board-window ")) &&
  [pair.a, pair.b].some((name) => name.startsWith(".golden-vein "));

/** Pairs closer than 8 board px where at least one is the board's own. */
function boardGaps({ own, others }) {
  const ownNames = new Set(own.map((target) => target.selector));
  // A scaled board snaps each box to device pixels, so an 8px gap can read
  // 7.99 board px on a shorter phone: allow a tenth of a pixel.
  return targetsCloserThan([...own, ...others], 7.9).filter(
    (pair) =>
      (ownNames.has(pair.a) || ownNames.has(pair.b)) && !veinOnWindow(pair),
  );
}

/** Text in the board's parts that a person sees, and its size. */
async function boardTextSizes(page, partsOf = BOARD_PARTS) {
  return page.evaluate((parts) => {
    const roots = [...document.querySelectorAll(parts)];
    const small = [];
    let count = 0;
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const own = [...el.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent ?? "")
          .join("")
          .trim();
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (
          own === "" ||
          box.width < 1 ||
          box.height < 1 ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          continue;
        }
        count += 1;
        const size = Number.parseFloat(style.fontSize);
        if (size < 13) {
          small.push(`${own.slice(0, 24)} ${String(size)}px`);
        }
      }
    }
    return { count, small };
  }, partsOf);
}

/** Every img, sprite and skin of the board drawn at exactly twice its art. */
async function boardArtAt2x(page, partsOf = BOARD_PARTS, artOf = BOARD_ART) {
  return page.evaluate(
    async (partsOf, artOf) => {
      const parts = [...document.querySelectorAll(partsOf)];
      const misses = [];
      let count = 0;
      // Art under visibility: hidden (an off spare plate) is not drawn.
      const drawn = (el) =>
        el.getClientRects().length > 0 &&
        el.closest("[hidden]") === null &&
        getComputedStyle(el).visibility !== "hidden";
      const natural = (url) =>
        new Promise((resolve) => {
          const art = new Image();
          art.onload = () => {
            resolve([art.naturalWidth, art.naturalHeight]);
          };
          art.onerror = () => {
            resolve([0, 0]);
          };
          art.src = url;
        });
      // Art still loading is not art drawn wrong: an img whose source just
      // changed is decoded, and a skin is given a few frames to paint once
      // its art has loaded (src/board-skin.ts), before either is measured.
      // The window keeps running while this waits, so the tub can swap to
      // its other picture inside the wait (#445): every frame decodes again
      // any img that is not loaded. The imgs and skins are then measured in
      // the same task as the last check, before the sprites' await, so no
      // frame can swap a picture in between. An img that never loads still
      // fails, after the 60 frames.
      const artParts = parts.filter((part) => part.matches(artOf));
      const images = () =>
        artParts.flatMap((part) => [...part.querySelectorAll("img")]);
      // Only drawn art is measured, so only drawn art is waited for.
      const loading = () =>
        images().filter(
          (img) =>
            drawn(img) &&
            img.getAttribute("src") &&
            (!img.complete || img.naturalWidth === 0),
        );
      const unpainted = () =>
        parts.some((part) =>
          [...part.querySelectorAll("canvas.board-skin")].some(
            (canvas) =>
              canvas.style.width === "" &&
              canvas.parentElement !== null &&
              drawn(canvas.parentElement),
          ),
        );
      await Promise.all(
        images().map((img) => img.decode().catch(() => undefined)),
      );
      for (
        let frame = 0;
        frame < 60 && (unpainted() || loading().length > 0);
        frame += 1
      ) {
        await Promise.all([
          new Promise((resolve) => requestAnimationFrame(resolve)),
          ...loading().map((img) => img.decode().catch(() => undefined)),
        ]);
      }
      // Every img and skin first, with no await: nothing moves while they are read.
      for (const part of parts) {
        const imgs = part.matches(artOf)
          ? [...part.querySelectorAll("img")].filter(drawn)
          : [];
        for (const img of imgs) {
          count += 1;
          if (
            img.naturalWidth === 0 ||
            img.clientWidth !== 2 * img.naturalWidth ||
            img.clientHeight !== 2 * img.naturalHeight
          ) {
            misses.push(
              `img ${img.className} ${String(img.clientWidth)}x${String(img.clientHeight)} of ${String(img.naturalWidth)}x${String(img.naturalHeight)}`,
            );
          }
        }
        for (const canvas of part.querySelectorAll("canvas.board-skin")) {
          if (!drawn(canvas.parentElement)) {
            continue;
          }
          count += 1;
          const width = Number.parseFloat(canvas.style.width);
          const height = Number.parseFloat(canvas.style.height);
          if (width !== 2 * canvas.width || height !== 2 * canvas.height) {
            misses.push(
              `skin of ${canvas.parentElement.className} ${canvas.style.width}x${canvas.style.height} of ${String(canvas.width)}x${String(canvas.height)}`,
            );
          }
        }
      }
      // Then the sprites, whose art sizes load one at a time.
      for (const part of parts) {
        const sprites = part.matches(artOf)
          ? [part, ...part.querySelectorAll("*")].filter(
              (el) =>
                drawn(el) &&
                el.tagName !== "CANVAS" &&
                getComputedStyle(el).backgroundImage.startsWith("url("),
            )
          : [];
        for (const sprite of sprites) {
          count += 1;
          const style = getComputedStyle(sprite);
          const url = /url\("?([^")]+)"?\)/.exec(style.backgroundImage)?.[1];
          const [width, height] = await natural(url ?? "");
          const size = style.backgroundSize.split(" ").map(Number.parseFloat);
          if (width === 0 || size[0] !== 2 * width || size[1] !== 2 * height) {
            misses.push(
              `sprite ${sprite.className} ${style.backgroundSize} of ${String(width)}x${String(height)}`,
            );
          }
        }
      }
      return { count, misses };
    },
    partsOf,
    artOf,
  );
}

/**
 * Each legend's text colour against its background pixels: the 10th and 90th
 * percentile by luminance (which the gate reads) and the darkest and lightest
 * (printed). The background is read from a screenshot (device scale 1)
 * taken with the text itself made clear, so glyph edges are never mistaken for
 * the background.
 */
async function boardContrast(page, legends = BOARD_LEGENDS) {
  const boxes = await page.evaluate((selector) => {
    // A legend scrolled out of an open drawer's list is not on screen.
    const inPort = (el) => {
      const list = el.closest(".board-sheet-list");
      if (list === null) {
        return true;
      }
      const box = el.getBoundingClientRect();
      const port = list.getBoundingClientRect();
      return box.top >= port.top - 0.5 && box.bottom <= port.bottom + 0.5;
    };
    return [...document.querySelectorAll(selector)]
      .filter((el) => {
        const style = getComputedStyle(el);
        return (
          (el.textContent ?? "").trim() !== "" &&
          el.getClientRects().length > 0 &&
          el.closest("[hidden]") === null &&
          inPort(el) &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0
        );
      })
      .map((el) => {
        // The words' own extent: a legend centred in a wide box (Stones a
        // sec spans the gauge) is read against what lies under its words,
        // not against the bezel beside them (#371).
        const outer = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const words = range.getBoundingClientRect();
        const box =
          words.width > 0 && words.height > 0
            ? {
                left: Math.max(outer.left, words.left),
                top: Math.max(outer.top, words.top),
                right: Math.min(outer.right, words.right),
                bottom: Math.min(outer.bottom, words.bottom),
              }
            : outer;
        const rgb = /rgba?\(([^)]+)\)/
          .exec(getComputedStyle(el).color)?.[1]
          .split(/[\s,/]+/)
          .slice(0, 3)
          .map(Number);
        return {
          text: (el.textContent ?? "").trim().slice(0, 28),
          fg: rgb ?? [0, 0, 0],
          clip: {
            x: Math.ceil(box.left),
            y: Math.ceil(box.top),
            width: Math.floor(box.right) - Math.ceil(box.left),
            height: Math.floor(box.bottom) - Math.ceil(box.top),
          },
        };
      });
  }, legends);
  const clear = await page.addStyleTag({
    content: `${legends
      .split(", ")
      .map((selector) => `${selector}, ${selector} *`)
      .join(
        ", ",
      )} { color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; }`,
  });
  const rows = [];
  for (const box of boxes) {
    if (box.clip.width < 1 || box.clip.height < 1) {
      rows.push({ ...box, ratio: 0, darkest: [], lightest: [] });
      continue;
    }
    const png = await page.screenshot({ clip: box.clip, encoding: "base64" });
    const range = await page.evaluate(
      (data, fg) =>
        new Promise((resolve) => {
          const art = new Image();
          art.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = art.naturalWidth;
            canvas.height = art.naturalHeight;
            const context = canvas.getContext("2d");
            context.drawImage(art, 0, 0);
            const { data: px } = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const all = [];
            for (let i = 0; i < px.length; i += 4) {
              const rgb = [px[i], px[i + 1], px[i + 2]];
              if (!rgb.every((channel, index) => channel === fg[index])) {
                all.push(rgb);
              }
            }
            all.sort((a, b) => lum(...a) - lum(...b));
            const at = (q) =>
              all[Math.min(all.length - 1, Math.floor(q * all.length))] ?? fg;
            resolve({
              darkest: all[0] ?? fg,
              lightest: all[all.length - 1] ?? fg,
              p10: at(0.1),
              p90: at(0.9),
            });
          };
          art.src = `data:image/png;base64,${data}`;
        }),
      png,
      box.fg,
    );
    const ratio = Math.min(
      contrastRatio(box.fg, range.darkest),
      contrastRatio(box.fg, range.lightest),
    );
    const pct = Math.min(
      contrastRatio(box.fg, range.p10),
      contrastRatio(box.fg, range.p90),
    );
    rows.push({
      ...box,
      ...range,
      ratio: Math.round(ratio * 100) / 100,
      pct: Math.round(pct * 100) / 100,
    });
  }
  await clear.evaluate((tag) => {
    tag.remove();
  });
  return rows;
}

/**
 * The open board card `name` measured in board px (#464): its face sits in the drawer's box
 * (top no higher than 178, bottom 4 over the save line, 8..416 at 424 wide) and never
 * scrolls; each plate is at least 48 tall and inside the face. Its title, its body's words
 * and the focused element's classes come back for the words checks.
 */
async function cardFacts(page, name) {
  return page.evaluate((card) => {
    const board = globalThis.__board();
    const root = document.querySelector(
      `.board-card[data-card="${card}"]:not([hidden])`,
    );
    const face = root?.querySelector(".board-card-face");
    if (root === null || face === null || face === undefined) {
      return { ok: false, missing: card };
    }
    const px = (rect) => ({
      l: (rect.left - board.left) / board.scale,
      t: (rect.top - board.top) / board.scale,
      r: (rect.right - board.left) / board.scale,
      b: (rect.bottom - board.top) / board.scale,
    });
    const box = px(face.getBoundingClientRect());
    const saveTop = (board.saveTop - board.top) / board.scale;
    const near = (a, b) => Math.abs(a - b) <= 0.5;
    const placed =
      box.t >= 178 - 0.5 &&
      near(box.b, saveTop - 4) &&
      near(box.l, 8) &&
      near(box.r, 416);
    const fits = face.scrollHeight <= face.clientHeight + 1;
    const plates = [...root.querySelectorAll(".board-card-plate, .save-card")]
      .filter((el) => el.closest("[hidden]") === null)
      .map((el) => {
        const b = px(el.getBoundingClientRect());
        return {
          words: (el.textContent ?? "").trim().slice(0, 28),
          height: Math.round((b.b - b.t) * 10) / 10,
          inside:
            b.l >= box.l - 0.5 &&
            b.r <= box.r + 0.5 &&
            b.t >= box.t - 0.5 &&
            b.b <= box.b + 0.5,
        };
      });
    const focused = document.activeElement;
    return {
      ok: true,
      box: [box.l, box.t, box.r, box.b].map(
        (side) => Math.round(side * 10) / 10,
      ),
      placed,
      fits,
      plates,
      platesOk: plates.every((plate) => plate.height >= 48 && plate.inside),
      title: (
        root.querySelector(".board-card-title")?.textContent ?? ""
      ).trim(),
      body: (root.querySelector(".board-card-body")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      focus:
        focused instanceof HTMLElement && root.contains(focused)
          ? focused.className
          : "",
    };
  }, name);
}

/** The bundled faces are loaded, so the plate is measured as it ships. */
async function boardFontsLoaded(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('700 13px "Barlow Condensed"'),
      document.fonts.load('26px "Share Tech Mono"'),
    ]);
    return (
      document.fonts.check('700 13px "Barlow Condensed"') &&
      document.fonts.check('26px "Share Tech Mono"') &&
      [...document.fonts].some(
        (face) =>
          face.family.replace(/"/g, "") === "Barlow Condensed" &&
          face.status === "loaded",
      ) &&
      [...document.fonts].some(
        (face) =>
          face.family.replace(/"/g, "") === "Share Tech Mono" &&
          face.status === "loaded",
      )
    );
  });
}

export {
  cardFacts,
  CARD_LEGENDS,
  drawerFacts,
  BAY_LEGENDS,
  boardTargets,
  boardGaps,
  boardTextSizes,
  boardArtAt2x,
  boardContrast,
  boardFontsLoaded,
};
