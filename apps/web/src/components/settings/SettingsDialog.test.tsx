import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

const mockUseProviderStore = vi.fn();

vi.mock("../../hooks/useProviderStore.js", () => ({
  useProviderStore: (...args: unknown[]) => mockUseProviderStore(...args),
}));

describe("SettingsDialog", () => {
  beforeEach(() => {
    mockUseProviderStore.mockReturnValue({
      status: "ready",
      error: null,
      catalog: [],
      credentials: [],
      connectCredential: vi.fn(async () => undefined),
      disconnectCredential: vi.fn(async () => undefined),
      manageProviderModels: {},
      visibleModelIds: {},
      loadingManageModelsForProviderIds: {},
      loadManageProviderModels: vi.fn(async () => []),
      toggleModelVisibility: vi.fn(),
      setProviderVisibleModels: vi.fn(),
    });
  });

  it("switches between General, Connect, and Models sections", () => {
    render(<SettingsDialog isOpen={true} onClose={vi.fn()} initialSection="general" />);

    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect Provider" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    expect(screen.getByRole("heading", { name: "Models" })).toBeInTheDocument();
  });

  it("opens directly to connect-provider flow when initial section is connect", () => {
    render(<SettingsDialog isOpen={true} onClose={vi.fn()} initialSection="connect" />);

    expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect Provider" })).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<SettingsDialog isOpen={true} onClose={onClose} initialSection="general" />);

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
