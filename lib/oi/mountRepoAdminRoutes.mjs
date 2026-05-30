import {
  applyContentSync,
  getRepoStatusPayload,
  reloadContentRepo,
  rollbackContentRepo
} from "./repoAdmin/syncContent.mjs";
import {
  createOiAdminAuthMiddleware,
  errorBodyForRepoAdmin,
  errorStatusForRepoAdmin
} from "./repoAdmin/adminAuth.mjs";
import { parseSyncContentMultipart } from "./repoAdmin/multipart.mjs";

/**
 * @param {import("express").Express} app
 * @param {{ projectRoot: string, adminBearerToken?: string }} options
 */
export function mountRepoAdminRoutes(app, options) {
  const adminAuth = createOiAdminAuthMiddleware(options.adminBearerToken);

  app.get("/api/repo/status", adminAuth, async (_req, res) => {
    try {
      res.status(200).json(await getRepoStatusPayload(options.projectRoot));
    } catch (error) {
      res.status(errorStatusForRepoAdmin(error)).json(errorBodyForRepoAdmin(error));
    }
  });

  app.post("/api/repo/sync/content", adminAuth, async (req, res) => {
    try {
      const { manifest, content } = await parseSyncContentMultipart(req);
      const result = await applyContentSync(options.projectRoot, manifest, content);
      res.status(200).json(result);
    } catch (error) {
      const body = errorBodyForRepoAdmin(error);
      console.error("[repo-admin] sync/content failed:", body);
      res.status(errorStatusForRepoAdmin(error)).json(body);
    }
  });

  app.post("/api/repo/reload", adminAuth, async (_req, res) => {
    try {
      res.status(200).json(await reloadContentRepo(options.projectRoot));
    } catch (error) {
      res.status(errorStatusForRepoAdmin(error)).json(errorBodyForRepoAdmin(error));
    }
  });

  app.post("/api/repo/rollback", adminAuth, async (_req, res) => {
    try {
      res.status(200).json(await rollbackContentRepo(options.projectRoot));
    } catch (error) {
      res.status(errorStatusForRepoAdmin(error)).json(errorBodyForRepoAdmin(error));
    }
  });
}
