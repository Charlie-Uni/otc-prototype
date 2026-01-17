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
  FUND_TOKEN_ADDRESS: z.string().refine(isAddress, "Invalid address"),
  NAV_REGISTRY_ADDRESS: z.string().refine(isAddress, "Invalid address"),
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
};

/**
 * Debug log (safe)
 */
console.log("ENV LOADED:", {
  RPC_URL: ENV.RPC_URL,
  PRIVATE_KEY: ENV.PRIVATE_KEY.slice(0, 10) + "...",
  FUND_TOKEN_ADDRESS: ENV.FUND_TOKEN_ADDRESS,
  NAV_REGISTRY_ADDRESS: ENV.NAV_REGISTRY_ADDRESS,
  PORT: ENV.PORT,
});
