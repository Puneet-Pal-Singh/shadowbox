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

const OpenAICompatibleModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
    }),
  ),
});

export class OpenAICompatibleModelCatalogAdapter implements ProviderModelCatalogPort {
  constructor(
    private readonly providerId: "openai" | "groq",
    private readonly baseUrl: string,
  ) {}

  async fetchAll(
    providerId: string,
    credentialContext: ProviderModelCredentialContext,
  ): Promise<BYOKDiscoveredProviderModel[]> {
    if (providerId !== this.providerId) {
      throw new ProviderModelDiscoveryApiError(
        `Adapter for "${this.providerId}" received unsupported provider "${providerId}".`,
        { status: 400, retryable: false },
      );
    }
    const response = await requestOpenAICompatibleModels(
      this.providerId,
      this.baseUrl,
      credentialContext.apiKey,
    );
    const payload = await parseOpenAICompatibleModels(response, this.providerId);
    return payload.data.map((item) => ({
      id: item.id,
      name: item.id,
      providerId: this.providerId,
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

function parseCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderModelDiscoveryApiError(
      `Invalid pagination cursor "${cursor}".`,
      { status: 400, retryable: false },
    );
  }
  return parsed;
}

async function requestOpenAICompatibleModels(
  providerId: "openai" | "groq",
  baseUrl: string,
  apiKey: string,
): Promise<Response> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/models`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    throw new ProviderModelDiscoveryApiError(
      `${providerId} models request failed due to network error: ${toErrorMessage(error)}`,
      { retryable: true },
    );
  }

  if (!response.ok) {
    throw new ProviderModelDiscoveryApiError(
      `${providerId} models request failed with status ${response.status}.`,
      { status: response.status, retryable: response.status >= 500 },
    );
  }
  return response;
}

async function parseOpenAICompatibleModels(
  response: Response,
  providerId: "openai" | "groq",
): Promise<z.infer<typeof OpenAICompatibleModelsSchema>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ProviderModelDiscoveryApiError(
      `${providerId} models response body was not valid JSON: ${toErrorMessage(error)}`,
      { retryable: false },
    );
  }

  const parsed = OpenAICompatibleModelsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderModelNormalizationError(
      `${providerId} models response failed schema validation.`,
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
