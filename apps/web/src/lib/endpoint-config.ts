export const REQUIRED_ENDPOINT_ENV_VARS = [
  "VITE_BRAIN_BASE_URL",
  "VITE_MUSCLE_BASE_URL",
  "VITE_MUSCLE_WS_URL",
] as const;

export type RequiredEndpointEnvVar =
  (typeof REQUIRED_ENDPOINT_ENV_VARS)[number];

type EndpointEnvRecord = Partial<Record<string, string | undefined>>;

export function findMissingEndpointEnvVars(
  env: EndpointEnvRecord,
): RequiredEndpointEnvVar[] {
  return REQUIRED_ENDPOINT_ENV_VARS.filter((key) => !env[key]);
}

export function formatMissingEndpointEnvMessage(
  missingVars: readonly RequiredEndpointEnvVar[],
): string {
  return `[platform-endpoints] Missing required endpoint environment variables: ${missingVars.join(", ")}`;
}

export function shouldFailFastEndpointBuild(env: EndpointEnvRecord): boolean {
  return env.SHADOWBOX_REQUIRE_DEPLOY_ENDPOINTS === "true";
}
