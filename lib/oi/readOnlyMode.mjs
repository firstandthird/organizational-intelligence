const READ_ONLY_ENV_PATTERN = /^(1|true|yes|on)$/i;

export function isReadOnlyMode() {
  const raw = process.env.OI_READ_ONLY ?? process.env.ORG_INTEL_READ_ONLY;
  if (raw === undefined || raw === null) {
    return false;
  }
  return READ_ONLY_ENV_PATTERN.test(String(raw).trim());
}

/**
 * @param {string} operation
 */
export function readOnlyToolResponse(operation) {
  return {
    summary: "Organizational Intelligence is in read-only mode.",
    data: { error: "READ_ONLY", operation }
  };
}
