import { z } from "zod";
import type { BYOKDiscoveredProviderModel } from "@repo/shared-types";
import type {
  ProviderModelCatalogPort,
} from "../ProviderModelCatalogPort";
import type {
  ProviderModelCredentialContext,
  ProviderModelFetchPageInput,
  ProviderModelPageFetchResult,
} from "../types";
import {
  ProviderModelDiscoveryApiError,
  ProviderModelNormalizationError,
} from "../errors";

const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const OPENROUTER_FETCH_TIMEOUT_MS = 30_000;

const OpenRouterModelsEnvelopeSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().optional(),
      context_length: z.number().int().positive().optional(),
      pricing: z
        .object({
          prompt: z.string().optional(),
          completion: z.string().optional(),
        })
        .partial()
        .optional(),
      supported_parameters: z.array(z.string()).optional(),
      architecture: z
        .object({
          modality: z.string().optional(),
        })
        .partial()
        .optional(),
    }),
  ),
});

export class OpenRouterModelCatalogAdapter implements ProviderModelCatalogPort {
  async fetchAll(
    providerId: string,
    credentialContext: ProviderModelCredentialContext,
  ): Promise<BYOKDiscoveredProviderModel[]> {
    if (providerId !== "openrouter") {
      throw new ProviderModelDiscoveryApiError(
        `OpenRouter adapter does not support provider "${providerId}".`,
        { status: 400, retryable: false },
      );
    }

    const response = await requestOpenRouterModels(credentialContext.apiKey);
    const payload = await parseOpenRouterModels(response);
    return payload.data.map((entry) => toDiscoveredModel(entry));
  }

  async fetchPage(input: ProviderModelFetchPageInput): Promise<ProviderModelPageFetchResult> {
    const offset = parseCursor(input.cursor);
    const models = await this.fetchAll(input.providerId, input.credentialContext);
    const nextOffset = offset + input.limit;
    const page = models.slice(offset, nextOffset);
    return {
      providerId: input.providerId,
      models: page,
      nextCursor: nextOffset < models.length ? String(nextOffset) : undefined,
      fetchedAt: new Date().toISOString(),
      source: "provider_api",
    };
  }
}

function toDiscoveredModel(
  entry: z.infer<typeof OpenRouterModelsEnvelopeSchema>["data"][number],
): BYOKDiscoveredProviderModel {
  return {
    id: entry.id,
    name: entry.name?.trim() || entry.id,
    providerId: "openrouter",
    contextWindow: entry.context_length,
    pricing: toPricing(entry.pricing),
    supportsTools: supportsTools(entry.supported_parameters),
    supportsVision: supportsVision(entry.architecture?.modality),
  };
}

function toPricing(
  pricing:
    | {
        prompt?: string | undefined;
        completion?: string | undefined;
      }
    | undefined,
) {
  if (!pricing) {
    return undefined;
  }
  const inputPer1M = parsePer1M(pricing.prompt);
  const outputPer1M = parsePer1M(pricing.completion);
  if (inputPer1M === undefined && outputPer1M === undefined) {
    return undefined;
  }
  return {
    inputPer1M,
    outputPer1M,
    currency: "USD",
  };
}

function parsePer1M(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber) || asNumber < 0) {
    return undefined;
  }
  return asNumber * 1_000_000;
}

function supportsTools(parameters: string[] | undefined): boolean | undefined {
  if (!parameters) {
    return undefined;
  }
  return parameters.includes("tools");
}

function supportsVision(modality: string | undefined): boolean | undefined {
  if (!modality) {
    return undefined;
  }
  return modality.includes("image");
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderModelDiscoveryApiError(
      `Invalid OpenRouter pagination cursor "${cursor}".`,
      { status: 400, retryable: false },
    );
  }
  return parsed;
}

async function requestOpenRouterModels(apiKey: string): Promise<Response> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), OPENROUTER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new ProviderModelDiscoveryApiError(
        `OpenRouter models request failed with status ${response.status}.`,
        { status: response.status, retryable: response.status >= 500 },
      );
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderModelDiscoveryApiError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderModelDiscoveryApiError(
        "OpenRouter models request timed out.",
        { status: 504, retryable: true },
      );
    }
    throw new ProviderModelDiscoveryApiError(
      `OpenRouter models request failed due to network error: ${toErrorMessage(error)}`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseOpenRouterModels(
  response: Response,
): Promise<z.infer<typeof OpenRouterModelsEnvelopeSchema>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ProviderModelDiscoveryApiError(
      `OpenRouter models response body was not valid JSON: ${toErrorMessage(error)}`,
      { retryable: false },
    );
  }
  const parsed = OpenRouterModelsEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderModelNormalizationError(
      "OpenRouter models response failed schema validation.",
    );
  }
  return parsed.data;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown_error";
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return error instanceof Error && error.name === "AbortError";
}
