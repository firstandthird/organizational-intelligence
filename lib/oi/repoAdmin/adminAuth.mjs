/**
 * @param {string | undefined} adminBearerToken
 */
export function createOiAdminAuthMiddleware(adminBearerToken) {
  return (req, res, next) => {
    if (!adminBearerToken) {
      res.status(503).json({ error: "ADMIN_NOT_CONFIGURED", message: "Admin API is not configured." });
      return;
    }

    const header = String(req.headers.authorization ?? "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token !== adminBearerToken) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
      return;
    }

    next();
  };
}

/**
 * @param {unknown} error
 */
export function errorStatusForRepoAdmin(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "APPLY_FAILED";
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "READ_ONLY":
      return 403;
    case "INVALID_MANIFEST":
    case "INVALID_ARCHIVE":
    case "VALIDATION_FAILED":
      return 400;
    case "BASE_SHA_MISMATCH":
    case "MERGE_IN_PROGRESS":
      return 409;
    case "REPOSITORY_MISMATCH":
      return 422;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "ADMIN_NOT_CONFIGURED":
      return 503;
    default:
      return 500;
  }
}

/**
 * @param {unknown} error
 */
export function errorBodyForRepoAdmin(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "APPLY_FAILED";
  const message = error instanceof Error ? error.message : "Request failed.";
  /** @type {Record<string, unknown>} */
  const body = { error: code, message };
  if (error && typeof error === "object") {
    if ("details" in error && error.details) {
      body.errors = error.details;
    }
    if ("expected" in error) {
      body.expected = error.expected;
    }
    if ("actual" in error) {
      body.actual = error.actual;
    }
  }
  return body;
}
