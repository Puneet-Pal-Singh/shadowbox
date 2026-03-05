import { z } from "zod";
import type { BYOKDiscoveredProviderModel } from "@repo/shared-types";
import type { ProviderModelCatalogPort } from "../ProviderModelCatalogPort";
import type {
  ProviderModelCredentialContext,
  ProviderModelFetchPageInput,
  ProviderModelPageFetchResult,
} from "../types";
import {
  ProviderModelDiscoveryApiError,
  ProviderModelNormalizationError,
} from "../errors";

const GoogleModelsEnvelopeSchema = z.object({
  models: z.array(
    z.object({
      name: z.string().min(1),
      displayName: z.string().optional(),
      description: z.string().optional(),
      inputTokenLimit: z.number().int().positive().optional(),
      supportedGenerationMethods: z.array(z.string()).optional(),
    }),
  ),
});

export class GoogleModelCatalogAdapter implements ProviderModelCatalogPort {
  async fetchAll(
    providerId: string,
    credentialContext: ProviderModelCredentialContext,
  ): Promise<BYOKDiscoveredProviderModel[]> {
    if (providerId !== "google") {
      throw new ProviderModelDiscoveryApiError(
        `Google adapter does not support provider "${providerId}".`,
        { status: 400, retryable: false },
      );
    }
    const endpoint = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    endpoint.searchParams.set("key", credentialContext.apiKey);

    const response = await fetch(endpoint.toString(), { method: "GET" });
    if (!response.ok) {
      throw new ProviderModelDiscoveryApiError(
        `Google models request failed with status ${response.status}.`,
        { status: response.status, retryable: response.status >= 500 },
      );
    }
    const payload = await response.json() as unknown;
    const parsed = GoogleModelsEnvelopeSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderModelNormalizationError(
        "Google models response failed schema validation.",
      );
    }
    return parsed.data.models
      .filter((model) => isLlmCapable(model.supportedGenerationMethods))
      .map((model) => ({
        id: stripModelsPrefix(model.name),
        name: model.displayName || stripModelsPrefix(model.name),
        providerId: "google",
        description: model.description,
        contextWindow: model.inputTokenLimit,
      }));
  }

  async fetchPage(input: ProviderModelFetchPageInput): Promise<ProviderModelPageFetchResult> {
    const models = await this.fetchAll(input.providerId, input.credentialContext);
    const offset = parseCursor(input.cursor);
    const nextOffset = offset + input.limit;
    return {
      providerId: input.providerId,
      models: models.slice(offset, nextOffset),
      nextCursor: nextOffset < models.length ? String(nextOffset) : undefined,
      fetchedAt: new Date().toISOString(),
      source: "provider_api",
    };
  }
}

function isLlmCapable(methods: string[] | undefined): boolean {
  if (!methods || methods.length === 0) {
    return true;
  }
  return methods.includes("generateContent");
}

function stripModelsPrefix(name: string): string {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}
