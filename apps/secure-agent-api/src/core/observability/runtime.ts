import {
  buildRuntimeFingerprint,
  buildRuntimeHeaders,
  collectFeatureFlagSnapshot,
  createRuntimeIdentity,
  resolveRuntimeGitSha,
} from "@repo/shared-types";
import type { Env } from "../../index";

const secureWorkerIdentity = createRuntimeIdentity("secure-agent-api-worker");

let startupLogged = false;

export function getSecureRuntimeHeaders(env: Env): Record<string, string> {
  ensureRuntimeStartupLogged(env);
  return buildRuntimeHeaders(secureWorkerIdentity, toEnvRecord(env));
}

export function buildSecureRuntimeDebugPayload(
  env: Env,
): Record<string, unknown> {
  ensureRuntimeStartupLogged(env);

  const gitSha = resolveRuntimeGitSha(toEnvRecord(env));

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
      bootId: secureWorkerIdentity.bootId,
      fingerprint: buildRuntimeFingerprint(secureWorkerIdentity, gitSha),
      gitSha,
      name: secureWorkerIdentity.name,
      startedAt: secureWorkerIdentity.startedAt,
    },
  };
}

function ensureRuntimeStartupLogged(env: Env): void {
  if (startupLogged) {
    return;
  }

  startupLogged = true;
  const gitSha = resolveRuntimeGitSha(toEnvRecord(env));
  const fingerprint = buildRuntimeFingerprint(secureWorkerIdentity, gitSha);
  const featureFlags = collectFeatureFlagSnapshot(toEnvRecord(env));

  console.log(
    `[runtime/startup] name=${secureWorkerIdentity.name} gitSha=${gitSha} startedAt=${secureWorkerIdentity.startedAt} bootId=${secureWorkerIdentity.bootId} fingerprint=${fingerprint} featureFlags=${JSON.stringify(featureFlags)}`,
  );
}

function toEnvRecord(env: Env): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}
