import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  expandEmbeddedReferences,
  normalizeEmbedTarget,
  parseWikilink
} from "../lib/oi/resolveEmbeddedReferences.mjs";

describe("normalizeEmbedTarget", () => {
  test("accepts nested paths", () => {
    assert.equal(normalizeEmbedTarget("clients/acme"), "clients/acme");
  });

  test("rejects path traversal", () => {
    assert.equal(normalizeEmbedTarget("../secret"), null);
  });
});

describe("parseWikilink", () => {
  test("parses alias and heading", () => {
    const alias = parseWikilink("[[clients/acme|Acme Corp]]");
    assert.equal(alias?.target, "clients/acme");
    assert.equal(alias?.alias, "Acme Corp");

    const heading = parseWikilink("![[clients#Overview]]");
    assert.equal(heading?.target, "clients");
    assert.equal(heading?.heading, "Overview");
  });
});

describe("expandEmbeddedReferences", () => {
  /** @type {Record<string, string>} */
  const docs = {
    about: "See [[beta]] for more.",
    beta: "Beta body.",
    a: "Link to [[b]].",
    b: "Back to [[a]].",
    parent: "Nested [[child]].",
    child: "Child body."
  };

  test("transcludes a single reference", () => {
    const result = expandEmbeddedReferences(docs.about, {
      resolveEntry: (target) =>
        docs[target] ? { key: target, body: docs[target] } : null
    });
    assert.match(result.text, /<!-- oi-embed: beta -->/);
    assert.match(result.text, /Beta body\./);
    assert.deepEqual(result.references, ["beta"]);
  });

  test("transcludes nested path references", () => {
    const nested = {
      "clients/acme": "Acme profile.",
      about: "Client: [[clients/acme]]"
    };
    const result = expandEmbeddedReferences(nested.about, {
      resolveEntry: (target) =>
        nested[target] ? { key: target, body: nested[target] } : null
    });
    assert.match(result.text, /<!-- oi-embed: clients\/acme -->/);
    assert.match(result.text, /Acme profile\./);
  });

  test("marks missing targets", () => {
    const result = expandEmbeddedReferences("Missing [[nope]].", {
      resolveEntry: () => null
    });
    assert.match(result.text, /\[oi-embed-missing: nope\]/);
    assert.deepEqual(result.missing, ["nope"]);
  });

  test("detects cycles", () => {
    const result = expandEmbeddedReferences(docs.a, {
      resolveEntry: (target) =>
        docs[target] ? { key: target, body: docs[target] } : null
    });
    assert.match(result.text, /\[oi-embed-cycle: b\]/);
    assert.ok(result.cycles.includes("b"));
  });

  test("respects max depth", () => {
    const result = expandEmbeddedReferences("Start [[parent]].", {
      maxDepth: 0,
      resolveEntry: (target) =>
        docs[target] ? { key: target, body: docs[target] } : null
    });
    assert.match(result.text, /<!-- oi-embed: parent -->/);
    assert.doesNotMatch(result.text, /Child body\./);
  });
});
