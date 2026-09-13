import { createHmac, createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { addDecimal } from "../lib/money.js";
import { resolveWithinBase } from "../lib/safe-path.js";
import type { GateDecision } from "./states.js";

export type LedgerPayload = {
  decision: GateDecision;
  intent: unknown;
  execution?: unknown;
  note?: string;
};

export type LedgerEntry = {
  seq: number;
  timestamp: string;
  prevHash: string;
  payload: LedgerPayload;
  payloadHash: string;
  hmac: string;
};

const GENESIS = "0".repeat(64);

export class HmacAuditLedger {
  private readonly path?: string;

  constructor(
    private readonly key: string,
    path?: string,
    private entries: LedgerEntry[] = [],
  ) {
    this.path = path === undefined ? undefined : resolveWithinBase(path);
    if (this.path) this.load();
  }

  append(payload: LedgerPayload): LedgerEntry {
    const prevHash = this.entries.at(-1)?.hmac ?? GENESIS;
    const seq = this.entries.length + 1;
    const timestamp = new Date().toISOString();
    const payloadHash = sha256(canonical(payload));
    const mac = createHmac("sha256", this.key)
      .update(`${seq}|${timestamp}|${prevHash}|${payloadHash}`)
      .digest("hex");
    const entry: LedgerEntry = { seq, timestamp, prevHash, payload, payloadHash, hmac: mac };
    this.entries.push(entry);
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, `${JSON.stringify(entry)}\n`, "utf8");
    }
    return entry;
  }

  verify(): { ok: boolean; brokenAt?: number; reason?: string } {
    let prev = GENESIS;
    for (const entry of this.entries) {
      if (entry.prevHash !== prev) {
        return { ok: false, brokenAt: entry.seq, reason: "prevHash mismatch" };
      }
      const expectedPayload = sha256(canonical(entry.payload));
      if (expectedPayload !== entry.payloadHash) {
        return { ok: false, brokenAt: entry.seq, reason: "payload hash mismatch" };
      }
      const expectedMac = createHmac("sha256", this.key)
        .update(`${entry.seq}|${entry.timestamp}|${entry.prevHash}|${entry.payloadHash}`)
        .digest("hex");
      if (expectedMac !== entry.hmac) {
        return { ok: false, brokenAt: entry.seq, reason: "HMAC mismatch" };
      }
      prev = entry.hmac;
    }
    return { ok: true };
  }

  dailySpentUsd(now = new Date()): string {
    const day = now.toISOString().slice(0, 10);
    let spent = "0";
    for (const entry of this.entries) {
      if (!entry.timestamp.startsWith(day)) continue;
      const state = entry.payload.decision.state;
      if (state !== "LOCKED") continue;
      const notional = entry.payload.decision.notionalUsd;
      if (notional) spent = addDecimal(spent, notional);
    }
    return spent;
  }

  all(): LedgerEntry[] {
    return [...this.entries];
  }

  private load(): void {
    if (!this.path || !existsSync(this.path)) return;
    const lines = readFileSync(this.path, "utf8").split("\n").filter(Boolean);
    this.entries = lines.map((line) => JSON.parse(line) as LedgerEntry);
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}
