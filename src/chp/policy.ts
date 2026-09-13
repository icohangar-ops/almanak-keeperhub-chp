import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { parseChainRef } from "../lib/chains.js";
import { assertDecimal } from "../lib/money.js";
import { resolveWithinBase } from "../lib/safe-path.js";

const PolicySchema = z.object({
  policy_id: z.string(),
  version: z.number().int().positive(),
  description: z.string().optional(),
  max_notional_usd: z.coerce.string(),
  hitl_notional_usd: z.coerce.string(),
  daily_cap_usd: z.coerce.string(),
  min_confidence: z.coerce.string(),
  allowed_chains: z.array(z.union([z.string(), z.number()])),
  allowed_venues: z.array(z.string()),
  allowed_tokens: z.array(z.string()).default([]),
  hitl_on_low_confidence: z.boolean().default(false),
});

export type Policy = {
  policyId: string;
  version: number;
  description?: string;
  maxNotionalUsd: string;
  hitlNotionalUsd: string;
  dailyCapUsd: string;
  minConfidence: string;
  allowedChainIds: Set<number>;
  allowedChainNames: Set<string>;
  allowedVenues: Set<string>;
  allowedTokens: Set<string>;
  hitlOnLowConfidence: boolean;
};

export function loadPolicy(path: string): Policy {
  const raw = parse(readFileSync(resolveWithinBase(path), "utf8"));
  return parsePolicy(raw);
}

export function parsePolicy(raw: unknown): Policy {
  const parsed = PolicySchema.parse(raw);
  const allowedChainIds = new Set<number>();
  const allowedChainNames = new Set<string>();
  for (const entry of parsed.allowed_chains) {
    const ref = parseChainRef(entry);
    if (ref.id !== undefined) allowedChainIds.add(ref.id);
    if (ref.name) allowedChainNames.add(ref.name.toLowerCase());
  }
  return {
    policyId: parsed.policy_id,
    version: parsed.version,
    description: parsed.description,
    maxNotionalUsd: assertDecimal(parsed.max_notional_usd, "max_notional_usd"),
    hitlNotionalUsd: assertDecimal(parsed.hitl_notional_usd, "hitl_notional_usd"),
    dailyCapUsd: assertDecimal(parsed.daily_cap_usd, "daily_cap_usd"),
    minConfidence: assertDecimal(parsed.min_confidence, "min_confidence"),
    allowedChainIds,
    allowedChainNames,
    allowedVenues: new Set(parsed.allowed_venues.map((v) => v.toLowerCase())),
    allowedTokens: new Set(parsed.allowed_tokens.map((t) => t.toUpperCase())),
    hitlOnLowConfidence: parsed.hitl_on_low_confidence,
  };
}

export function chainAllowed(policy: Policy, chainId: number | undefined, chainName?: string): boolean {
  if (chainId !== undefined && policy.allowedChainIds.has(chainId)) return true;
  if (chainName && policy.allowedChainNames.has(chainName.toLowerCase())) return true;
  return false;
}
