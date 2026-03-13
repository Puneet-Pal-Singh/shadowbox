import {
  buildRuntimeFingerprint,
  buildRuntimeHeaders,
  collectFeatureFlagSnapshot,
  createRuntimeIdentity,
  resolveRuntimeGitSha,
} from "@repo/shared-types";
import type { Env } from "../../types/ai";

const brainWorkerIdentity = createRuntimeIdentity("brain-worker");
const runEngineIdentity = createRuntimeIdentity("brain-run-engine-do");

let workerStartupLogged = false;
let runEngineStartupLogged = false;

interface RuntimeBindingSnapshot {
  brainMuscleBaseUrlConfigured: boolean;
  runEngineRuntimeBound: boolean;
  secureApiBound: boolean;
}

interface RuntimeDebugPayload {
  bindings: RuntimeBindingSnapshot;
  featureFlags: Record<string, string>;
  runtime: {
    bootId: string;
    fingerprint: string;
    gitSha: string;
    name: string;
    startedAt: string;
  };
}

export function getBrainRuntimeHeaders(env: Env): Record<string, string> {
  ensureBrainWorkerStartupLogged(env);
  return buildRuntimeHeaders(brainWorkerIdentity, toEnvRecord(env));
}

export function getRunEngineRuntimeHeaders(env: Env): Record<string, string> {
  ensureRunEngineStartupLogged(env);
  return buildRuntimeHeaders(runEngineIdentity, toEnvRecord(env));
}

export function buildBrainRuntimeDebugPayload(env: Env): RuntimeDebugPayload {
  ensureBrainWorkerStartupLogged(env);
  return {
    bindings: {
      brainMuscleBaseUrlConfigured:
        typeof env.MUSCLE_BASE_URL === "string" &&
        env.MUSCLE_BASE_URL.trim().length > 0,
      runEngineRuntimeBound: Boolean(env.RUN_ENGINE_RUNTIME),
      secureApiBound: Boolean(env.SECURE_API),
    },
    featureFlags: collectFeatureFlagSnapshot(toEnvRecord(env)),
    runtime: buildRuntimePayload(brainWorkerIdentity, env),
  };
}

export function buildRunEngineRuntimeDebugPayload(
  env: Env,
): RuntimeDebugPayload {
  ensureRunEngineStartupLogged(env);
  return {
    bindings: {
      brainMuscleBaseUrlConfigured:
        typeof env.MUSCLE_BASE_URL === "string" &&
        env.MUSCLE_BASE_URL.trim().length > 0,
      runEngineRuntimeBound: Boolean(env.RUN_ENGINE_RUNTIME),
      secureApiBound: Boolean(env.SECURE_API),
    },
    featureFlags: collectFeatureFlagSnapshot(toEnvRecord(env)),
    runtime: buildRuntimePayload(runEngineIdentity, env),
  };
}

function ensureBrainWorkerStartupLogged(env: Env): void {
  if (workerStartupLogged) {
    return;
  }

  workerStartupLogged = true;
  logRuntimeStartup(brainWorkerIdentity, env);
}

function ensureRunEngineStartupLogged(env: Env): void {
  if (runEngineStartupLogged) {
    return;
  }

  runEngineStartupLogged = true;
  logRuntimeStartup(runEngineIdentity, env);
}

function logRuntimeStartup(
  identity: { bootId: string; name: string; startedAt: string },
  env: Env,
): void {
  const gitSha = resolveRuntimeGitSha(toEnvRecord(env));
  const fingerprint = buildRuntimeFingerprint(identity, gitSha);
  const featureFlags = collectFeatureFlagSnapshot(toEnvRecord(env));

  console.log(
    `[runtime/startup] name=${identity.name} gitSha=${gitSha} startedAt=${identity.startedAt} bootId=${identity.bootId} fingerprint=${fingerprint} featureFlags=${JSON.stringify(featureFlags)}`,
  );
}

function buildRuntimePayload(
  identity: { bootId: string; name: string; startedAt: string },
  env: Env,
) {
  const gitSha = resolveRuntimeGitSha(toEnvRecord(env));

  return {
    bootId: identity.bootId,
    fingerprint: buildRuntimeFingerprint(identity, gitSha),
    gitSha,
    name: identity.name,
    startedAt: identity.startedAt,
  };
}

function toEnvRecord(env: Env): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}
