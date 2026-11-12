// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWER_SETTLE_MS,
  createBoardSheet,
  type BoardSheet,
} from "./board-drawer";
import { createBoardHost, type BoardHost } from "./board-host";
import { createMemoryStorage } from "./mountain-screen.harness";
import { SOUND_KEY, createSoundKey, playHammer, soundSetting } from "./sound";

let time = 0;
let board: BoardHost;
let sheet: BoardSheet;
let made: number[];
let previousAudio: typeof window.AudioContext;

/** Counts the knocks: one AudioContext per knock. */
class FakeAudio {
  sampleRate = 8000;
  destination = {};
  constructor() {
    made.push(1);
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource() {
    const source = {
      buffer: null as unknown,
      connect: () => undefined,
      start: () => {
        source.onended?.();
      },
      onended: null as (() => void) | null,
    };
    return source;
  }
  createGain() {
    return { gain: { value: 0 }, connect: () => undefined };
  }
  close() {
    return Promise.resolve();
  }
}

/** A finger's tap: down, up, then its click. */
const press = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
  made = [];
  previousAudio = window.AudioContext;
  window.AudioContext = FakeAudio as unknown as typeof window.AudioContext;
  board = createBoardHost({
    clock: () => time,
    pressAge: () => 0,
    reduced: () => false,
  });
  sheet = createBoardSheet({
    name: "ledger",
    title: "Ledger",
    infoLabel: "Tonight and the mine",
    how: { systems: [], backLabel: "Back" },
    board,
    overSave: () => false,
  });
  document.body.append(sheet.root);
});

afterEach(() => {
  window.AudioContext = previousAudio;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the sound setting (#491)", () => {
  it("is Quiet on a device that never chose", () => {
    expect(soundSetting(createMemoryStorage()).on()).toBe(false);
  });

  it("is still on after a reload, and still off once turned off", () => {
    const storage = createMemoryStorage();
    soundSetting(storage).turn(true);
    expect(storage.getItem(SOUND_KEY)).toBe("on");
    expect(soundSetting(storage).on()).toBe(true);
    soundSetting(storage).turn(false);
    expect(soundSetting(storage).on()).toBe(false);
  });

  it("reads anything else as Quiet", () => {
    const storage = createMemoryStorage();
    storage.setItem(SOUND_KEY, "loud");
    expect(soundSetting(storage).on()).toBe(false);
  });

  it("is Quiet where the store throws, and turns on for this open anyway", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const sound = soundSetting(broken);
    expect(sound.on()).toBe(false);
    sound.turn(true);
    expect(sound.on()).toBe(true);
  });
});

describe("the Sound key (#374, #491)", () => {
  it("reads the setting, and flips aria-pressed and its label", () => {
    const storage = createMemoryStorage();
    const quiet = createSoundKey({ board, sound: soundSetting(storage) });
    expect(quiet.root.classList.contains("sound-key")).toBe(true);
    expect(quiet.root.classList.contains("board-platebtn")).toBe(true);
    expect(quiet.root.textContent).toBe("Quiet");
    expect(quiet.root.getAttribute("aria-pressed")).toBe("false");
    expect(quiet.root.getAttribute("aria-label")).toBe("Sound is off");
    soundSetting(storage).turn(true);
    const on = createSoundKey({ board, sound: soundSetting(storage) });
    expect(on.root.textContent).toBe("Sound");
    expect(on.root.getAttribute("aria-pressed")).toBe("true");
    expect(on.root.getAttribute("aria-label")).toBe("Sound is on");
  });

  it("a tap past the settle turns it on with one knock, and keeps it; one inside it does nothing", () => {
    const storage = createMemoryStorage();
    const sound = soundSetting(storage);
    const key = createSoundKey({ board, sound });
    sheet.root.append(key.root);
    sheet.open();
    time += 100;
    press(key.root);
    expect(sound.on()).toBe(false);
    expect(made).toHaveLength(0);
    time += DRAWER_SETTLE_MS;
    press(key.root);
    expect(sound.on()).toBe(true);
    expect(storage.getItem(SOUND_KEY)).toBe("on");
    expect(key.root.getAttribute("aria-pressed")).toBe("true");
    expect(made).toHaveLength(1);
    time += DRAWER_SETTLE_MS;
    press(key.root);
    expect(sound.on()).toBe(false);
    expect(key.root.textContent).toBe("Quiet");
    expect(made).toHaveLength(1);
    key.forget();
  });
});

describe("the hammer's knock (#374)", () => {
  it("makes no AudioContext while quiet, and one when on", () => {
    playHammer(false);
    expect(made).toHaveLength(0);
    playHammer(true);
    expect(made).toHaveLength(1);
  });

  it("stays quiet where there is no AudioContext", () => {
    Reflect.deleteProperty(window, "AudioContext");
    expect(() => {
      playHammer(true);
    }).not.toThrow();
  });
});
