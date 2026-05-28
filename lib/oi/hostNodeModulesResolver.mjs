import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve as pathResolve, sep } from "node:path";

const hostRoot = process.env.OI_HOST_ROOT;
const hostRequire = hostRoot
  ? createRequire(pathToFileURL(join(hostRoot, "package.json")))
  : null;

/**
 * @param {string} specifier
 * @returns {boolean}
 */
function isBareSpecifier(specifier) {
  return (
    !specifier.startsWith(".") &&
    !specifier.startsWith("file:") &&
    !specifier.startsWith("node:") &&
    !specifier.startsWith("#")
  );
}

/**
 * @param {string | undefined} parentURL
 * @returns {boolean}
 */
function isExternalToHost(parentURL) {
  if (!hostRoot || !parentURL) {
    return false;
  }

  const parentPath = pathResolve(fileURLToPath(parentURL));
  const normalizedHostRoot = pathResolve(hostRoot);
  return parentPath !== normalizedHostRoot && !parentPath.startsWith(`${normalizedHostRoot}${sep}`);
}

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  if (!hostRequire || !isBareSpecifier(specifier) || !isExternalToHost(context.parentURL)) {
    return nextResolve(specifier, context);
  }

  try {
    const resolved = hostRequire.resolve(specifier);
    return {
      url: pathToFileURL(resolved).href,
      shortCircuit: true
    };
  } catch {
    return nextResolve(specifier, context);
  }
}
