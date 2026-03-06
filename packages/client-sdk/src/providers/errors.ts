import { BYOKErrorEnvelopeSchema, type BYOKErrorEnvelope } from "./types.js";

export class ProviderClientContractError extends Error {
  constructor(
    public readonly phase: "request" | "response",
    public readonly operation: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderClientContractError";
  }
}

export class ProviderClientOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = "ProviderClientOperationError";
  }

  static fromEnvelope(envelope: BYOKErrorEnvelope): ProviderClientOperationError {
    const { error } = envelope;
    return new ProviderClientOperationError(
      error.code,
      error.message,
      error.retryable,
      error.correlationId,
    );
  }
}

export function isProviderErrorEnvelope(
  payload: unknown,
): payload is BYOKErrorEnvelope {
  return BYOKErrorEnvelopeSchema.safeParse(payload).success;
}

export function parseProviderErrorEnvelope(
  payload: unknown,
): BYOKErrorEnvelope | null {
  const parsed = BYOKErrorEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}
