// apps/api/src/env.ts
import * as dotenv from "dotenv";
import { z } from "zod";
import { isAddress, getAddress } from "viem";

/**
 * Explicitly load apps/api/.env
 * This avoids cwd / monorepo / tsx issues entirely.
 */
dotenv.config({ path: "./.env" });

const EnvSchema = z.object({
  RPC_URL: z.string().url(),
  PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid private key"),
  ORACLE_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid oracle private key"),
  FUND_TOKEN_ADDRESS: z.string().refine(isAddress, "Invalid address"),
  NAV_REGISTRY_ADDRESS: z.string().refine(isAddress, "Invalid address"),
  RISK_REGISTRY_ADDRESS: z.string().refine(isAddress, "Invalid address"),
  FUND_ID_LABEL: z.string().min(1).default("OTC_FUND_1"),
  PUBLIC_DISCLOSURE_DELAY_SEC: z.coerce.number().int().min(0).default(0),
  REDEMPTION_PRESSURE_WINDOW_SEC: z.coerce.number().int().positive().default(24 * 60 * 60),
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
};

/**
 * Debug log (safe)
 */
console.log("ENV LOADED:", {
  RPC_URL: ENV.RPC_URL,
  PRIVATE_KEY: ENV.PRIVATE_KEY.slice(0, 10) + "...",
  ORACLE_PRIVATE_KEY: ENV.ORACLE_PRIVATE_KEY.slice(0, 10) + "...",
  FUND_TOKEN_ADDRESS: ENV.FUND_TOKEN_ADDRESS,
  NAV_REGISTRY_ADDRESS: ENV.NAV_REGISTRY_ADDRESS,
  RISK_REGISTRY_ADDRESS: ENV.RISK_REGISTRY_ADDRESS,
  FUND_ID_LABEL: ENV.FUND_ID_LABEL,
  PUBLIC_DISCLOSURE_DELAY_SEC: ENV.PUBLIC_DISCLOSURE_DELAY_SEC,
  REDEMPTION_PRESSURE_WINDOW_SEC: ENV.REDEMPTION_PRESSURE_WINDOW_SEC,
  PORT: ENV.PORT,
});
