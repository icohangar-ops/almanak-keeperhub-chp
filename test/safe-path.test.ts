import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HmacAuditLedger } from "../src/chp/ledger.js";
import { loadPolicy } from "../src/chp/policy.js";
import { loadConfig, readTextIfExists } from "../src/lib/config.js";
import { resolveWithinBase } from "../src/lib/safe-path.js";

const cwd = process.cwd();
const policyFile = "policy.example.yaml";

describe("resolveWithinBase", () => {
  it("keeps relative in-tree paths", () => {
    expect(resolveWithinBase(policyFile)).toBe(resolve(cwd, policyFile));
    expect(resolveWithinBase(`.chp/ledger.jsonl`)).toBe(resolve(cwd, ".chp/ledger.jsonl"));
  });

  it("keeps absolute paths already under the base", () => {
    const abs = resolve(cwd, policyFile);
    expect(resolveWithinBase(abs)).toBe(abs);
  });

  it("rejects relative traversal and out-of-tree absolutes", () => {
    expect(() => resolveWithinBase("../etc/passwd")).toThrow(/escapes allowed directory/);
    expect(() => resolveWithinBase(join(cwd, "..", "outside.yaml"))).toThrow(/escapes allowed directory/);
    expect(() => resolveWithinBase("/etc/passwd")).toThrow(/escapes allowed directory/);
  });
});

describe("config and policy filesystem reads", () => {
  it("loadConfig resolves in-tree policy and ledger paths", () => {
    const config = loadConfig({
      policyPath: policyFile,
      ledgerPath: ".chp/ledger.jsonl",
    });
    expect(config.policyPath).toBe(resolve(cwd, policyFile));
    expect(config.ledgerPath).toBe(resolve(cwd, ".chp/ledger.jsonl"));
  });

  it("loadConfig rejects override traversal", () => {
    expect(() => loadConfig({ policyPath: "../../etc/passwd" })).toThrow(/escapes allowed directory/);
    expect(() => loadConfig({ ledgerPath: "../secrets/ledger.jsonl" })).toThrow(/escapes allowed directory/);
  });

  it("readTextIfExists reads in-tree files and rejects traversal", () => {
    const text = readTextIfExists(policyFile);
    expect(text).toMatch(/policy_id/);
    expect(readTextIfExists("does-not-exist.yaml")).toBeUndefined();
    expect(() => readTextIfExists("../etc/passwd")).toThrow(/escapes allowed directory/);
  });

  it("loadPolicy reads the example policy and rejects traversal", () => {
    const policy = loadPolicy(policyFile);
    expect(policy.policyId).toBeTruthy();
    expect(() => loadPolicy("../etc/passwd")).toThrow(/escapes allowed directory/);
  });
});

describe("ledger filesystem path", () => {
  it("rejects a path that escapes the working directory", () => {
    expect(() => new HmacAuditLedger("unit-test-key", "../outside.jsonl")).toThrow(/escapes allowed directory/);
  });

  it("reads and writes an in-tree ledger file", () => {
    const dir = mkdtempSync(join(cwd, ".chp-test-"));
    const path = join(dir, "ledger.jsonl");
    try {
      const ledger = new HmacAuditLedger("unit-test-key", path);
      ledger.append({
        decision: {
          state: "LOCKED",
          trail: ["EXPLORING", "PROVISIONAL", "LOCKED"],
          reasons: [{ code: "test", message: "test" }],
          policyId: "test",
          notionalUsd: "1",
          dailySpentUsd: "0",
          dailyRemainingUsd: "1",
        },
        intent: {},
      });
      const reloaded = new HmacAuditLedger("unit-test-key", path);
      expect(reloaded.all()).toHaveLength(1);
      expect(reloaded.verify()).toEqual({ ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
