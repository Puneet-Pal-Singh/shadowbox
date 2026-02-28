import { z } from "zod";
import type { ModelProvider } from "./ModelProvider.js";

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const ProviderAdapterIdSchema = z
  .string()
  .regex(
    PROVIDER_ID_PATTERN,
    "Provider adapter id must match ^[a-z][a-z0-9-]*$",
  );

export type ProviderAdapterId = z.infer<typeof ProviderAdapterIdSchema>;

export interface ProviderAdapterFactory {
  createProvider(): ModelProvider;
}

export interface ProviderAdapterRegistration {
  providerId: ProviderAdapterId;
  factory: ProviderAdapterFactory;
  description?: string;
}

export interface ProviderAdapterDescriptor {
  providerId: ProviderAdapterId;
  description?: string;
}

export class ProviderAdapterRegistry {
  private registrations = new Map<ProviderAdapterId, ProviderAdapterRegistration>();

  register(registration: ProviderAdapterRegistration): void {
    const providerId = this.parseProviderId(registration.providerId);
    this.assertNotRegistered(providerId);
    this.registrations.set(providerId, {
      ...registration,
      providerId,
    });
  }

  has(providerId: string): boolean {
    const parsed = ProviderAdapterIdSchema.safeParse(providerId);
    if (!parsed.success) {
      return false;
    }
    return this.registrations.has(parsed.data);
  }

  resolve(providerId: string): ModelProvider {
    const parsedProviderId = this.parseProviderId(providerId);
    const registration = this.registrations.get(parsedProviderId);
    if (!registration) {
      throw new ProviderAdapterNotRegisteredError(parsedProviderId);
    }
    return registration.factory.createProvider();
  }

  list(): ProviderAdapterDescriptor[] {
    return Array.from(this.registrations.values()).map((registration) => ({
      providerId: registration.providerId,
      description: registration.description,
    }));
  }

  unregister(providerId: string): boolean {
    const parsed = ProviderAdapterIdSchema.safeParse(providerId);
    if (!parsed.success) {
      return false;
    }
    return this.registrations.delete(parsed.data);
  }

  private parseProviderId(providerId: string): ProviderAdapterId {
    const parsed = ProviderAdapterIdSchema.safeParse(providerId);
    if (!parsed.success) {
      throw new InvalidProviderAdapterIdError(providerId);
    }
    return parsed.data;
  }

  private assertNotRegistered(providerId: ProviderAdapterId): void {
    if (!this.registrations.has(providerId)) {
      return;
    }
    throw new DuplicateProviderAdapterRegistrationError(providerId);
  }
}

export class InvalidProviderAdapterIdError extends Error {
  constructor(providerId: string) {
    super(`[adapters/registry] Invalid provider adapter id: ${providerId}`);
    this.name = "InvalidProviderAdapterIdError";
  }
}

export class DuplicateProviderAdapterRegistrationError extends Error {
  constructor(providerId: string) {
    super(`[adapters/registry] Duplicate provider adapter registration: ${providerId}`);
    this.name = "DuplicateProviderAdapterRegistrationError";
  }
}

export class ProviderAdapterNotRegisteredError extends Error {
  constructor(providerId: string) {
    super(`[adapters/registry] Provider adapter not registered: ${providerId}`);
    this.name = "ProviderAdapterNotRegisteredError";
  }
}
