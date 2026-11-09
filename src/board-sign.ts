import { el, setAttr, write } from "./board-dom";
import { skin } from "./board-skin";
import type { KeyId } from "./key-rail";

/*
 * The New sign (#373): one line on the tag skin, standing in the slim band between the Ready
 * row and the key rail, over the key whose sheet is new. It is a sign, not a button: it takes no
 * taps (board.css), so a tap meant for the plate or a key goes through, and readers hear its
 * words on the key's own label instead. The screen decides when it shows and puts it away.
 */

export interface BoardSign {
  readonly root: HTMLElement;
  show(key: KeyId, words: string): void;
  hide(): void;
  /** The key and words on show, or undefined while it is away. */
  shown(): { readonly key: KeyId; readonly words: string } | undefined;
}

export function createBoardSign(): BoardSign {
  const root = el("div", "board-sign-slot");
  root.setAttribute("aria-hidden", "true");
  root.hidden = true;
  const sign = el("span", "board-sign");
  skin(sign, "tag");
  const text = el("span", "board-sign-text");
  sign.append(text);
  root.append(sign);

  let current: { readonly key: KeyId; readonly words: string } | undefined;
  return {
    root,
    show(key, words) {
      setAttr(root, "data-key", key);
      write(text, words);
      if (root.hidden) {
        root.hidden = false;
      }
      current = { key, words };
    },
    hide() {
      if (!root.hidden) {
        root.hidden = true;
      }
      current = undefined;
    },
    shown: () => current,
  };
}
