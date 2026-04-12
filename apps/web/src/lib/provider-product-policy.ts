import {
  createProviderProductPolicy,
  type ProviderProductEnvironment,
  type ProviderProductPolicy,
} from "@repo/shared-types";

function normalizeEnvironmentToken(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function parseProductEnvironment(
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

export function resolveWebProviderProductEnvironment(input?: {
  mode?: string;
  productEnv?: string;
}): ProviderProductEnvironment {
  const normalizedProductEnv = normalizeEnvironmentToken(input?.productEnv);
  const normalizedMode = normalizeEnvironmentToken(input?.mode);

  const parsedProductEnv = parseProductEnvironment(normalizedProductEnv);
  if (parsedProductEnv) {
    return parsedProductEnv;
  }

  const parsedMode = parseProductEnvironment(normalizedMode);
  if (parsedMode) {
    return parsedMode;
  }

  throw new Error(
    `Unrecognized environment: mode="${normalizedMode}", productEnv="${normalizedProductEnv}". Expected one of: development, dev, test, local, staging, production, prod`,
  );
}

export function resolveWebProviderProductPolicy(): ProviderProductPolicy {
  const environment = resolveWebProviderProductEnvironment({
    mode: import.meta.env.MODE,
    productEnv: import.meta.env.VITE_PRODUCT_ENV,
  });
  return createProviderProductPolicy(environment);
}
