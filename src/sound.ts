import type { BoardHost } from "./board-host";
import { setAttr, write } from "./board-dom";
import { plateButton } from "./board-save";
import { pressOnBoard } from "./card-tap";
import { SOUND_ON, SOUND_QUIET } from "./screen-words";

/*
 * The game's one sound (#491): whether this device has turned it on, the Ledger's Sound key
 * that turns it, and the hammer's knock, its only sound so far. Quiet until he asks: the house
 * is asleep. The setting is a habit of this device, like the Buys amount, so it is kept in
 * localStorage beside it and never in the save. A store that throws, or a value this build
 * cannot read, is Quiet.
 */

/** Where this device keeps its choice: "on", or "off". */
export const SOUND_KEY = "dad-friendly-sound";

type DeviceStorage = Pick<Storage, "getItem" | "setItem">;

/** This device's sound: read once at boot, then kept with every turn. */
export interface SoundSetting {
  on(): boolean;
  /** Turns it on or off and keeps that; a store that refuses still turns it for this open. */
  turn(on: boolean): void;
}

function stored(storage: DeviceStorage | undefined): boolean {
  try {
    return (storage ?? localStorage).getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

/** The one setting, read from `storage` (localStorage when undefined). */
export function soundSetting(storage: DeviceStorage | undefined): SoundSetting {
  let on = stored(storage);
  return {
    on: () => on,
    turn: (next) => {
      on = next;
      try {
        (storage ?? localStorage).setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        // Private mode or a full store: the next open starts Quiet.
      }
    },
  };
}

/** The hammer's tap: a short soft knock, only once the dad has turned the sound on. */
export function playHammer(soundOn: boolean): void {
  if (!soundOn) {
    return;
  }
  const Context = (window as Window & { AudioContext?: typeof AudioContext })
    .AudioContext;
  if (Context === undefined) {
    return;
  }
  const audio = new Context();
  const seconds = 0.09;
  const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const fade = 1 - index / length;
    data[index] = (Math.random() * 2 - 1) * fade * fade;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const gain = audio.createGain();
  gain.gain.value = 0.12;
  source.connect(gain);
  gain.connect(audio.destination);
  source.onended = () => {
    void audio.close();
  };
  source.start();
}

/**
 * The Sound key, a head key beside the Ledger's "i". A press the board lets act turns the
 * setting over, and turning it on knocks once, so he hears what he turned on.
 */
export function createSoundKey({
  board,
  sound,
}: {
  board: BoardHost;
  sound: SoundSetting;
}): {
  readonly root: HTMLButtonElement;
  /** The drawer moved on: a press that never reached its click is dropped. */
  forget(): void;
} {
  const root = plateButton(SOUND_QUIET);
  root.classList.add("sound-key");
  const text = root.querySelector<HTMLElement>(".board-platebtn-text") ?? root;
  const paint = (): void => {
    const on = sound.on();
    write(text, on ? SOUND_ON : SOUND_QUIET);
    setAttr(root, "aria-pressed", on ? "true" : "false");
    setAttr(root, "aria-label", on ? "Sound is on" : "Sound is off");
  };
  const tracker = pressOnBoard(
    root,
    board,
    { layer: "ledger", id: "sound" },
    (decision) => {
      if (decision !== "act") {
        return;
      }
      sound.turn(!sound.on());
      playHammer(sound.on());
      paint();
    },
  );
  paint();
  return {
    root,
    forget: () => {
      tracker.forget();
    },
  };
}
