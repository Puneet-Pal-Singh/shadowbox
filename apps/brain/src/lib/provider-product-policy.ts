import {
  createProviderProductPolicy,
  type ProviderProductEnvironment,
  type ProviderProductPolicy,
} from "@repo/shared-types";
import type { Env } from "../types/ai";

function normalizeToken(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function parseEnvironmentToken(
  token: string,
): ProviderProductEnvironment | null {
  if (!token) {
    return null;
  }

  if (token === "staging" || token.includes("staging")) {
    return "staging";
  }

  if (token === "production" || token === "prod") {
    return "production";
  }

  if (
    token === "development" ||
    token === "dev" ||
    token === "test" ||
    token.includes("local")
  ) {
    return "development";
  }

  return null;
}

export function resolveBrainProviderProductEnvironment(
  env: Pick<Env, "NODE_ENV" | "ENVIRONMENT">,
): ProviderProductEnvironment {
  const parsedEnvironment = parseEnvironmentToken(
    normalizeToken(env.ENVIRONMENT),
  );
  if (parsedEnvironment) {
    return parsedEnvironment;
  }

  const parsedNodeEnv = parseEnvironmentToken(normalizeToken(env.NODE_ENV));
  if (parsedNodeEnv) {
    return parsedNodeEnv;
  }

  // Safety default for worker runtime with unset env bindings.
  return "production";
}

export function resolveBrainProviderProductPolicy(env: Env): ProviderProductPolicy {
  return createProviderProductPolicy(resolveBrainProviderProductEnvironment(env));
}
