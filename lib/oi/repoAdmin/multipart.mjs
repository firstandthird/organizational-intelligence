import { MAX_TARBALL_BYTES } from "./constants.mjs";

/**
 * @param {import("node:stream").Readable} stream
 * @returns {Promise<Buffer>}
 */
function readStreamToBuffer(stream) {
  /** @type {Buffer[]} */
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<{ manifest: unknown, content: Buffer }>}
 */
export async function parseSyncContentMultipart(req) {
  const contentType = String(req.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    const error = new Error("Expected multipart/form-data request.");
    error.code = "INVALID_MANIFEST";
    throw error;
  }

  const Busboy = (await import("busboy")).default;
  const busboy = Busboy({ headers: req.headers, limits: { files: 2, fileSize: MAX_TARBALL_BYTES } });

  /** @type {unknown} */
  let manifest;
  /** @type {Buffer | undefined} */
  let content;

  await new Promise((resolve, reject) => {
    busboy.on("file", (fieldName, fileStream) => {
      readStreamToBuffer(fileStream)
        .then((buffer) => {
          if (fieldName === "manifest") {
            try {
              manifest = JSON.parse(buffer.toString("utf8"));
            } catch {
              const error = new Error("Manifest must be valid JSON.");
              error.code = "INVALID_MANIFEST";
              reject(error);
              return;
            }
          } else if (fieldName === "content") {
            content = buffer;
          } else {
            const error = new Error(`Unexpected multipart field: ${fieldName}`);
            error.code = "INVALID_MANIFEST";
            reject(error);
          }
        })
        .catch(reject);
    });
    busboy.on("error", reject);
    busboy.on("finish", resolve);
    req.pipe(busboy);
  });

  if (!manifest || !content) {
    const error = new Error("Multipart request must include manifest and content fields.");
    error.code = "INVALID_MANIFEST";
    throw error;
  }

  return { manifest, content };
}
