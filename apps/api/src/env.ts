// apps/api/src/env.ts
import * as dotenv from "dotenv";
import { z } from "zod";
import { isAddress, getAddress } from "viem";

const ApiKeySchema = z.string().min(16, "API key must contain at least 16 characters");

/**
 * Explicitly load apps/api/.env, resolved relative to this module
 * (not the process cwd), so starting the API from the repo root works too.
 */
dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

const EnvSchema = z.object({
  RPC_URL: z.string().url(),
  PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid private key"),
  ORACLE_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid oracle private key"),
  REGULATOR_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid regulator private key"),
  LIQUIDITY_ORACLE_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid liquidity oracle private key"),
  FUND_TOKEN_ADDRESS: z.string().refine(isAddress, "Invalid address"),
  NAV_REGISTRY_ADDRESS: z.string().refine(isAddress, "Invalid address"),
  RISK_REGISTRY_ADDRESS: z.string().refine(isAddress, "Invalid address"),
  FUND_ID_LABEL: z.string().min(1).default("OTC_FUND_1"),
  DEFAULT_TRANSPARENCY_REGIME: z.enum(["R0", "R1", "R2", "R3", "R4"]).default("R4"),
  ALLOW_REGIME_QUERY_OVERRIDE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  API_KEY_INVESTOR: ApiKeySchema,
  API_KEY_INVESTOR_ADDRESS: z.string().refine(isAddress, "Invalid investor address"),
  API_KEY_MANAGER: ApiKeySchema,
  API_KEY_REGISTRAR: ApiKeySchema,
  API_KEY_NAV_ORACLE: ApiKeySchema,
  API_KEY_LIQUIDITY_ORACLE: ApiKeySchema,
  API_KEY_RISK_ORACLE: ApiKeySchema,
  API_KEY_REGULATOR: ApiKeySchema,
  API_KEY_AUDITOR: ApiKeySchema,
  REDEMPTION_PRESSURE_WINDOW_SEC: z.coerce.number().int().positive().default(24 * 60 * 60),
  RISK_INPUT_MAX_AGE_SEC: z.coerce.number().int().positive().default(300),
  // First block to scan for lifecycle/control logs (set to the deployment block
  // in long-lived environments to bound public-view log scans).
  CHAIN_LOG_START_BLOCK: z.coerce.number().int().nonnegative().default(0),
  // Upper bound for /audit/export rows in PostgreSQL mode (memory mode is
  // already bounded by the in-memory buffer).
  AUDIT_EXPORT_MAX_ROWS: z.coerce.number().int().positive().default(50_000),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().optional(),
});

/**
 * Parse & validate
 */
const raw = EnvSchema.parse(process.env);

/**
 * Normalize addresses (EIP-55 checksum)
 */
export const ENV = {
  ...raw,
  FUND_TOKEN_ADDRESS: getAddress(raw.FUND_TOKEN_ADDRESS),
  NAV_REGISTRY_ADDRESS: getAddress(raw.NAV_REGISTRY_ADDRESS),
  RISK_REGISTRY_ADDRESS: getAddress(raw.RISK_REGISTRY_ADDRESS),
  API_KEY_INVESTOR_ADDRESS: getAddress(raw.API_KEY_INVESTOR_ADDRESS),
};
