// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useStickerMediaWidthSelector } from "../useStickerMediaWidthSelector";

function HookHarness({ mediaWidthMm }: { mediaWidthMm: number }) {
  const { selectedMediaValue, setSelectedMediaValue } =
    useStickerMediaWidthSelector(mediaWidthMm);

  return (
    <>
      <span data-testid="selected-media">{selectedMediaValue}</span>
      <button type="button" onClick={() => setSelectedMediaValue("custom")}>
        Custom
      </button>
    </>
  );
}

describe("useStickerMediaWidthSelector", () => {
  it("preserves an explicit custom selection until the media width changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<HookHarness mediaWidthMm={1000} />);

    expect(screen.getByTestId("selected-media")).toHaveTextContent("1000");

    await user.click(screen.getByRole("button", { name: "Custom" }));

    expect(screen.getByTestId("selected-media")).toHaveTextContent("custom");

    rerender(<HookHarness mediaWidthMm={1000} />);

    expect(screen.getByTestId("selected-media")).toHaveTextContent("custom");

    rerender(<HookHarness mediaWidthMm={1270} />);

    await waitFor(() => {
      expect(screen.getByTestId("selected-media")).toHaveTextContent("1270");
    });
  });

  it("defaults to custom for non-preset media widths", () => {
    render(<HookHarness mediaWidthMm={1111} />);

    expect(screen.getByTestId("selected-media")).toHaveTextContent("custom");
  });
});
