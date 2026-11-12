/**
 * One id per build (#516). `vite build` writes it into `sw.js`, so every
 * deploy ships a worker with new bytes and an open page's `registration.update()`
 * finds it (the update card, #464), and into the field log's `version`.
 */

/** The line `public/sw.js` carries for the build to replace. */
export const BUILD_PLACEHOLDER = "// Build: dev";

/** What the field log reports where no build stamped the bundle: dev, tests, `play`. */
const UNSTAMPED = "dev";
/** A build with neither Actions' commit nor git. */
const NO_COMMIT = "local";
const SHORT_SHA = 7;
/** The field log caps its text at 24 characters (`FIELD_LOG_TEXT_MAX`). */
const SAFE_ID = /^[A-Za-z0-9._-]{1,24}$/;

/** The build's id: the commit's short sha from Actions, else from git, else `local`. */
export async function buildId(
  env: { readonly GITHUB_SHA?: string | undefined },
  gitShortSha: () => Promise<string>,
): Promise<string> {
  const fromActions = env.GITHUB_SHA?.trim();
  if (fromActions !== undefined && fromActions !== "") {
    return fromActions.slice(0, SHORT_SHA);
  }
  try {
    const fromGit = (await gitShortSha()).trim();
    return fromGit === "" ? NO_COMMIT : fromGit;
  } catch {
    return NO_COMMIT;
  }
}

/** The worker's source with the build written in. Throws if the placeholder is gone. */
export function stampServiceWorker(source: string, id: string): string {
  if (!SAFE_ID.test(id)) {
    throw new Error(`build id ${JSON.stringify(id)} is not a short plain word`);
  }
  if (!source.includes(BUILD_PLACEHOLDER)) {
    throw new Error(`sw.js has no ${BUILD_PLACEHOLDER} line to stamp`);
  }
  return source.replace(BUILD_PLACEHOLDER, `// Build: ${id}`);
}

/**
 * The field log's version: the id `vite build` defined as `__APP_BUILD__`, or
 * `dev` where nothing did (the dev server, `play` and Vitest).
 */
export function appVersion(): string {
  return typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : UNSTAMPED;
}
