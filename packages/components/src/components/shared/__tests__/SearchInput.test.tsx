// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { DONE_TYPING_INTERVAL } from "@konfi/utils";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TFunction } from "i18next";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "../SearchInput";

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as TFunction;

function renderSearchInput(
  props: Partial<ComponentProps<typeof SearchInput>> = {},
) {
  return render(
    <ChakraProvider value={defaultSystem}>
      <SearchInput
        placeholder={"Search orders..."}
        searchFn={vi.fn<(searchKey: string, vector?: boolean) => void>()}
        t={t}
        {...props}
      />
    </ChakraProvider>,
  );
}

describe("SearchInput", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the search button by default", async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn<(searchKey: string, vector?: boolean) => void>();

    renderSearchInput({
      searchFn,
    });

    const input = screen.getByRole("searchbox", {
      name: "Search orders...",
    });

    await user.type(input, "banner");

    expect(searchFn).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledWith("banner", false);
  });

  it("submits when Enter is pressed by default", async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn<(searchKey: string, vector?: boolean) => void>();

    renderSearchInput({
      searchFn,
    });

    const input = screen.getByRole("searchbox", {
      name: "Search orders...",
    });

    await user.type(input, "poster");

    expect(searchFn).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");

    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledWith("poster", false);
  });

  it("supports debounced search when requested", async () => {
    vi.useFakeTimers();
    const searchFn = vi.fn<(searchKey: string, vector?: boolean) => void>();

    renderSearchInput({
      searchFn,
      searchMode: "debounced",
    });

    const input = screen.getByRole("searchbox", {
      name: "Search orders...",
    });

    act(() => {
      fireEvent.change(input, {
        target: { value: "leaflet" },
      });
    });

    expect(searchFn).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(DONE_TYPING_INTERVAL - 1);
    });
    expect(searchFn).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledWith("leaflet", false);

    act(() => {
      vi.runOnlyPendingTimers();
    });
  });
});
