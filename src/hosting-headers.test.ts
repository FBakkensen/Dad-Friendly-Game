import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type HeaderBlock = {
  readonly source: string;
  readonly headers: readonly { readonly key: string; readonly value: string }[];
};

function readHostingHeaders(): readonly HeaderBlock[] {
  const parsed: unknown = JSON.parse(readFileSync("firebase.json", "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("hosting" in parsed)) {
    throw new Error("firebase.json hosting is missing");
  }
  const hosting = parsed.hosting;
  if (
    typeof hosting !== "object" ||
    hosting === null ||
    !("headers" in hosting)
  ) {
    throw new Error("firebase.json hosting.headers is missing");
  }
  if (!Array.isArray(hosting.headers)) {
    throw new Error("firebase.json hosting.headers must be a list");
  }
  return hosting.headers.map(parseHeaderBlock);
}

function parseHeaderBlock(value: unknown): HeaderBlock {
  if (typeof value !== "object" || value === null) {
    throw new Error("header block must be an object");
  }
  if (!("source" in value) || !("headers" in value)) {
    throw new Error("header block needs source and headers");
  }
  if (typeof value.source !== "string" || !Array.isArray(value.headers)) {
    throw new Error("header block has the wrong shape");
  }
  const headers = value.headers.map((header: unknown) => {
    if (typeof header !== "object" || header === null) {
      throw new Error("header entry must be an object");
    }
    if (!("key" in header) || !("value" in header)) {
      throw new Error("header entry needs key and value");
    }
    if (typeof header.key !== "string" || typeof header.value !== "string") {
      throw new Error("header key and value must be strings");
    }
    return { key: header.key, value: header.value };
  });
  return { source: value.source, headers };
}

describe("Firebase Hosting cache headers", () => {
  it("does not cache the boot HTML and immutable-caches hashed assets", () => {
    const blocks = readHostingHeaders();
    const html = blocks.find((block) => block.source === "**");
    const assets = blocks.find((block) => block.source === "/assets/**");
    expect(html?.headers).toEqual([
      { key: "Cache-Control", value: "no-cache" },
    ]);
    expect(assets?.headers).toEqual([
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable",
      },
    ]);
    expect(blocks.findIndex((block) => block.source === "**")).toBeLessThan(
      blocks.findIndex((block) => block.source === "/assets/**"),
    );
  });
});
