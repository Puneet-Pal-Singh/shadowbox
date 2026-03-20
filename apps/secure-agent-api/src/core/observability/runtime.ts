import {
  buildRuntimeFingerprint,
  buildRuntimeHeaders,
  collectFeatureFlagSnapshot,
  createRuntimeIdentity,
  resolveRuntimeGitSha,
  type RuntimeIdentity,
} from "@repo/shared-types";
import type { Env } from "../../index";

let startupLogged = false;
let secureWorkerIdentity: RuntimeIdentity | null = null;

export function getSecureRuntimeHeaders(env: Env): Record<string, string> {
  ensureRuntimeStartupLogged(env);
  return buildRuntimeHeaders(getSecureWorkerIdentity(), toEnvRecord(env));
}

export function buildSecureRuntimeDebugPayload(
  env: Env,
): Record<string, unknown> {
  ensureRuntimeStartupLogged(env);

  const gitSha = resolveRuntimeGitSha(toEnvRecord(env));
  const identity = getSecureWorkerIdentity();

  return {
    bindings: {
      agentRuntimeBound: Boolean(env.AGENT_RUNTIME),
      sandboxBound: Boolean(env.Sandbox),
      artifactsBound: Boolean(env.ARTIFACTS),
    },
    cors: {
      allowDevOrigins: env.CORS_ALLOW_DEV_ORIGINS ?? "false",
      configuredOrigins: env.CORS_ALLOWED_ORIGINS?.trim() || "",
    },
    featureFlags: collectFeatureFlagSnapshot(toEnvRecord(env)),
    runtime: {
      bootId: identity.bootId,
      fingerprint: buildRuntimeFingerprint(identity, gitSha),
      gitSha,
      name: identity.name,
      startedAt: identity.startedAt,
    },
  };
}

function ensureRuntimeStartupLogged(env: Env): void {
  if (startupLogged) {
    return;
  }

  startupLogged = true;
  const identity = getSecureWorkerIdentity();
  const gitSha = resolveRuntimeGitSha(toEnvRecord(env));
  const fingerprint = buildRuntimeFingerprint(identity, gitSha);
  const featureFlags = collectFeatureFlagSnapshot(toEnvRecord(env));

  console.log(
    `[runtime/startup] name=${identity.name} gitSha=${gitSha} startedAt=${identity.startedAt} bootId=${identity.bootId} fingerprint=${fingerprint} featureFlags=${JSON.stringify(featureFlags)}`,
  );
}

function getSecureWorkerIdentity(): RuntimeIdentity {
  if (!secureWorkerIdentity) {
    secureWorkerIdentity = createRuntimeIdentity("secure-agent-api-worker");
  }

  return secureWorkerIdentity;
}

function toEnvRecord(env: Env): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}
