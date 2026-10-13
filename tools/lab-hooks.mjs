/** Resolves extensionless relative imports the lab sources use. */
export async function resolve(specifier, context, nextResolve) {
  if (needsTypeScriptExtension(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}

function needsTypeScriptExtension(specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return false;
  }
  const slash = specifier.lastIndexOf("/");
  const base = slash === -1 ? specifier : specifier.slice(slash + 1);
  return !base.includes(".");
}
