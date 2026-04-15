import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRODUCT_MODES } from "@repo/shared-types";
import { PermissionModeControl } from "./PermissionModeControl";

describe("PermissionModeControl", () => {
  it("shows the current permission selection", () => {
    render(
      <PermissionModeControl
        value={PRODUCT_MODES.AUTO_FOR_SAFE}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Permission mode" }),
    ).toHaveTextContent("Auto edits");
  });

  it("lets users switch from auto edits to full access", () => {
    const onChange = vi.fn();
    render(
      <PermissionModeControl
        value={PRODUCT_MODES.AUTO_FOR_SAFE}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Permission mode" }));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /full access/i }),
    );

    expect(onChange).toHaveBeenCalledWith(PRODUCT_MODES.FULL_AGENT);
    expect(screen.queryByTestId("permission-mode-menu")).not.toBeInTheDocument();
  });

  it("maps legacy same-repo mode to the auto edits label", () => {
    render(
      <PermissionModeControl
        value={PRODUCT_MODES.AUTO_FOR_SAME_REPO}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Permission mode" }),
    ).toHaveTextContent("Auto edits");
  });
});
