import { z } from "zod";

export const SdkConsumerSurfaceSchema = z.enum(["web", "desktop", "cli"]);
export type SdkConsumerSurface = z.infer<typeof SdkConsumerSurfaceSchema>;

export const SdkReadinessStatusSchema = z.enum(["ready", "partial", "blocked"]);
export type SdkReadinessStatus = z.infer<typeof SdkReadinessStatusSchema>;

export const SdkChecklistItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    requirement: z.string().min(1),
    required: z.boolean(),
  })
  .strict();
export type SdkChecklistItem = z.infer<typeof SdkChecklistItemSchema>;

export const SdkReferenceExamplesSchema = z
  .object({
    connectProvider: z.string().min(1),
    streamEvents: z.string().min(1),
    compatibilityPolicy: z.string().min(1),
  })
  .strict();
export type SdkReferenceExamples = z.infer<typeof SdkReferenceExamplesSchema>;

export const SdkSurfaceReadinessSchema = z
  .object({
    surface: SdkConsumerSurfaceSchema,
    status: SdkReadinessStatusSchema,
    checklist: z.array(SdkChecklistItemSchema).min(1),
    blockers: z.array(z.string().min(1)),
    requiredDependencies: z.array(z.string().min(1)).min(1),
    migrationNotes: z.array(z.string().min(1)).min(1),
    referenceExamples: SdkReferenceExamplesSchema,
  })
  .strict();
export type SdkSurfaceReadiness = z.infer<typeof SdkSurfaceReadinessSchema>;

export const SdkReadinessPackSchema = z
  .object({
    version: z.literal("v1"),
    protocolPolicyReference: z.string().min(1),
    contractReferences: z.array(z.string().min(1)).min(1),
    surfaces: z.array(SdkSurfaceReadinessSchema).length(3),
  })
  .strict();
export type SdkReadinessPack = z.infer<typeof SdkReadinessPackSchema>;

export const SDK_READINESS_PACK_V1: SdkReadinessPack = {
  version: "v1",
  protocolPolicyReference:
    "packages/shared-types/PROTOCOL_VERSIONING_POLICY.md#compatibility-window",
  contractReferences: [
    "@repo/shared-types/src/chat-response-contract.ts",
    "@repo/shared-types/src/external-contracts.ts",
    "@repo/shared-types/src/credential-vault.ts",
  ],
  surfaces: [
    {
      surface: "web",
      status: "partial",
      checklist: buildCoreChecklist("web"),
      blockers: [
        "Await protocol policy merge from SHA-17 before consumer release lock.",
      ],
      requiredDependencies: buildDependencies("web"),
      migrationNotes: [
        "Use ProviderApiClient/provider store surfaces only; avoid direct BYOK route coupling in UI layers.",
      ],
      referenceExamples: buildReferenceExamples("web"),
    },
    {
      surface: "desktop",
      status: "blocked",
      checklist: buildCoreChecklist("desktop"),
      blockers: [
        "Desktop CredentialVault implementation is stub-only until secure storage integration lands.",
      ],
      requiredDependencies: buildDependencies("desktop"),
      migrationNotes: [
        "Implement desktop vault methods before enabling persisted provider sessions.",
      ],
      referenceExamples: buildReferenceExamples("desktop"),
    },
    {
      surface: "cli",
      status: "partial",
      checklist: buildCoreChecklist("cli"),
      blockers: [
        "CLI command UX for provider credential bootstrap remains pending.",
      ],
      requiredDependencies: buildDependencies("cli"),
      migrationNotes: [
        "Adopt chat response contract parser for streamed event output rendering.",
      ],
      referenceExamples: buildReferenceExamples("cli"),
    },
  ],
};

export function getSdkReadinessPack(): SdkReadinessPack {
  return SdkReadinessPackSchema.parse(SDK_READINESS_PACK_V1);
}

export function validateSdkReadinessPack(pack: unknown): boolean {
  return SdkReadinessPackSchema.safeParse(pack).success;
}

export function collectSdkBlockers(
  pack: SdkReadinessPack,
): Record<SdkConsumerSurface, string[]> {
  return {
    web: findSurface(pack, "web").blockers,
    desktop: findSurface(pack, "desktop").blockers,
    cli: findSurface(pack, "cli").blockers,
  };
}

function findSurface(
  pack: SdkReadinessPack,
  surface: SdkConsumerSurface,
): SdkSurfaceReadiness {
  const readiness = pack.surfaces.find((item) => item.surface === surface);
  if (readiness) {
    return readiness;
  }
  throw new Error(`[sdk/readiness] missing surface definition for "${surface}"`);
}

function buildCoreChecklist(surface: SdkConsumerSurface): SdkChecklistItem[] {
  return [
    {
      id: `${surface}-contract-parse`,
      title: "Contract parsing",
      requirement:
        "Validate chat stream payloads with ChatResponseEventSchema before rendering/dispatch.",
      required: true,
    },
    {
      id: `${surface}-compat-policy`,
      title: "Protocol compatibility gate",
      requirement:
        "Reject unsupported protocol versions outside compatibility window.",
      required: true,
    },
    {
      id: `${surface}-vault-surface`,
      title: "CredentialVault surface integration",
      requirement:
        "Use CredentialVault contracts for provider credentials instead of provider-specific key storage.",
      required: true,
    },
  ];
}

function buildDependencies(surface: SdkConsumerSurface): string[] {
  return [
    "SHA-17 protocol policy merge",
    "SHA-11 credential vault contract",
    `Consumer implementation owner: ${surface}-integration-team`,
  ];
}

function buildReferenceExamples(
  surface: SdkConsumerSurface,
): SdkReferenceExamples {
  return {
    connectProvider:
      `import { EXTERNAL_PROVIDER_CONTRACT } from "@repo/shared-types"; // ${surface}`,
    streamEvents:
      `import { parseChatResponseEventContract } from "@repo/shared-types"; // ${surface}`,
    compatibilityPolicy:
      "packages/shared-types/PROTOCOL_VERSIONING_POLICY.md#change-categories",
  };
}
