/**
 * @param {string | undefined | null} sha
 * @returns {string}
 */
export function normalizeSha(sha) {
  return String(sha ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param {string | undefined | null} sha
 * @returns {boolean}
 */
export function isValidSha(sha) {
  const normalized = normalizeSha(sha);
  return /^[0-9a-f]{7,40}$/.test(normalized);
}

/**
 * @param {string | undefined | null} left
 * @param {string | undefined | null} right
 * @returns {boolean}
 */
export function shaEquals(left, right) {
  const a = normalizeSha(left);
  const b = normalizeSha(right);
  if (!a || !b) {
    return false;
  }
  return a === b || a.startsWith(b) || b.startsWith(a);
}
