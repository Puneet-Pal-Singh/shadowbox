import {
  buildRuntimeFingerprint,
  buildRuntimeHeaders,
  collectFeatureFlagSnapshot,
  createRuntimeIdentity,
  resolveRuntimeGitSha,
  type RuntimeIdentity,
} from "@repo/shared-types";
import type { Env } from "../../types/ai";

const MODULE_STARTED_AT = new Date().toISOString();

let workerStartupLogged = false;
let runEngineStartupLogged = false;
let brainWorkerIdentity: RuntimeIdentity | null = null;
let runEngineIdentity: RuntimeIdentity | null = null;

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
  return buildRuntimeHeaders(getBrainWorkerIdentity(), toEnvRecord(env));
}

export function getRunEngineRuntimeHeaders(env: Env): Record<string, string> {
  ensureRunEngineStartupLogged(env);
  return buildRuntimeHeaders(getRunEngineIdentity(), toEnvRecord(env));
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
    runtime: buildRuntimePayload(getBrainWorkerIdentity(), env),
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
    runtime: buildRuntimePayload(getRunEngineIdentity(), env),
  };
}

function ensureBrainWorkerStartupLogged(env: Env): void {
  if (workerStartupLogged) {
    return;
  }

  logRuntimeStartup(getBrainWorkerIdentity(), env);
  workerStartupLogged = true;
}

function ensureRunEngineStartupLogged(env: Env): void {
  if (runEngineStartupLogged) {
    return;
  }

  logRuntimeStartup(getRunEngineIdentity(), env);
  runEngineStartupLogged = true;
}

function getBrainWorkerIdentity(): RuntimeIdentity {
  if (!brainWorkerIdentity) {
    brainWorkerIdentity = createRuntimeIdentity(
      "brain-worker",
      MODULE_STARTED_AT,
    );
  }

  return brainWorkerIdentity;
}

function getRunEngineIdentity(): RuntimeIdentity {
  if (!runEngineIdentity) {
    runEngineIdentity = createRuntimeIdentity(
      "brain-run-engine-do",
      MODULE_STARTED_AT,
    );
  }

  return runEngineIdentity;
}

function logRuntimeStartup(
  identity: RuntimeIdentity,
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
  identity: RuntimeIdentity,
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
