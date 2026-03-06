import { describe, expect, it, expectTypeOf } from "vitest";
import {
  BUILTIN_PROVIDERS,
  ModelDescriptorSchema,
  ProviderAdapterFamilySchema,
  ProviderCapabilityFlagsSchema,
  ProviderCatalogEntrySchema,
  ProviderCatalogResponseSchema,
  ProviderConnectionSchema,
  ProviderConnectionStateSchema,
  ProviderConnectionsResponseSchema,
  ProviderErrorCodeSchema,
  ProviderIdSchema,
  ProviderRegistryEntrySchema,
  ProviderRegistrySchema,
  ProviderValidationAuthModeSchema,
  getBuiltinRegistry,
  type ModelDescriptor,
  type ProviderCatalogEntry,
  type ProviderCatalogResponse,
  type ProviderConnection,
  type ProviderConnectionsResponse,
  type ProviderId,
  type ProviderRegistryEntry,
} from "./index.js";
import {
  BUILTIN_PROVIDERS as SharedBUILTIN_PROVIDERS,
  ModelDescriptorSchema as SharedModelDescriptorSchema,
  ProviderAdapterFamilySchema as SharedProviderAdapterFamilySchema,
  ProviderCapabilityFlagsSchema as SharedProviderCapabilityFlagsSchema,
  ProviderCatalogEntrySchema as SharedProviderCatalogEntrySchema,
  ProviderCatalogResponseSchema as SharedProviderCatalogResponseSchema,
  ProviderConnectionSchema as SharedProviderConnectionSchema,
  ProviderConnectionStateSchema as SharedProviderConnectionStateSchema,
  ProviderConnectionsResponseSchema as SharedProviderConnectionsResponseSchema,
  ProviderErrorCodeSchema as SharedProviderErrorCodeSchema,
  ProviderIdSchema as SharedProviderIdSchema,
  ProviderRegistryEntrySchema as SharedProviderRegistryEntrySchema,
  ProviderRegistrySchema as SharedProviderRegistrySchema,
  ProviderValidationAuthModeSchema as SharedProviderValidationAuthModeSchema,
  getBuiltinRegistry as SharedGetBuiltinRegistry,
  type ModelDescriptor as SharedModelDescriptor,
  type ProviderCatalogEntry as SharedProviderCatalogEntry,
  type ProviderCatalogResponse as SharedProviderCatalogResponse,
  type ProviderConnection as SharedProviderConnection,
  type ProviderConnectionsResponse as SharedProviderConnectionsResponse,
  type ProviderId as SharedProviderId,
  type ProviderRegistryEntry as SharedProviderRegistryEntry,
} from "@repo/shared-types";

describe("provider-core contract parity", () => {
  it("re-exports canonical provider contract schemas", () => {
    expect(ProviderIdSchema).toBe(SharedProviderIdSchema);
    expect(ProviderCapabilityFlagsSchema).toBe(
      SharedProviderCapabilityFlagsSchema,
    );
    expect(ModelDescriptorSchema).toBe(SharedModelDescriptorSchema);
    expect(ProviderCatalogEntrySchema).toBe(SharedProviderCatalogEntrySchema);
    expect(ProviderCatalogResponseSchema).toBe(SharedProviderCatalogResponseSchema);
    expect(ProviderConnectionStateSchema).toBe(
      SharedProviderConnectionStateSchema,
    );
    expect(ProviderConnectionSchema).toBe(SharedProviderConnectionSchema);
    expect(ProviderConnectionsResponseSchema).toBe(
      SharedProviderConnectionsResponseSchema,
    );
    expect(ProviderErrorCodeSchema).toBe(SharedProviderErrorCodeSchema);
    expect(ProviderAdapterFamilySchema).toBe(SharedProviderAdapterFamilySchema);
    expect(ProviderValidationAuthModeSchema).toBe(
      SharedProviderValidationAuthModeSchema,
    );
    expect(ProviderRegistryEntrySchema).toBe(SharedProviderRegistryEntrySchema);
    expect(ProviderRegistrySchema).toBe(SharedProviderRegistrySchema);
    expect(BUILTIN_PROVIDERS).toBe(SharedBUILTIN_PROVIDERS);
    expect(getBuiltinRegistry).toBe(SharedGetBuiltinRegistry);
  });

  it("keeps provider contract types equal to shared-types", () => {
    expectTypeOf<ProviderId>().toEqualTypeOf<SharedProviderId>();
    expectTypeOf<ModelDescriptor>().toEqualTypeOf<SharedModelDescriptor>();
    expectTypeOf<ProviderCatalogEntry>().toEqualTypeOf<SharedProviderCatalogEntry>();
    expectTypeOf<ProviderCatalogResponse>().toEqualTypeOf<SharedProviderCatalogResponse>();
    expectTypeOf<ProviderConnection>().toEqualTypeOf<SharedProviderConnection>();
    expectTypeOf<ProviderConnectionsResponse>().toEqualTypeOf<SharedProviderConnectionsResponse>();
    expectTypeOf<ProviderRegistryEntry>().toEqualTypeOf<SharedProviderRegistryEntry>();
  });
});
