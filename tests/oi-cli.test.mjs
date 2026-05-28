import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseOiArgs } from "../oi.mjs";

describe("oi.mjs CLI", () => {
  test("parseOiArgs extracts --data and forwards other flags", () => {
    assert.deepEqual(parseOiArgs(["--data", ".", "--port", "3000", "--validate"]), {
      args: ["--port", "3000", "--validate"],
      dataPath: "."
    });
  });

  test("parseOiArgs rejects missing --data value", () => {
    assert.throws(() => parseOiArgs(["--data"]), /Missing value for --data/);
  });
});
