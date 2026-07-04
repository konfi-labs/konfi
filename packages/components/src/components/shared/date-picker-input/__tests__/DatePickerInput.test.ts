// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useState } from "react";
import { beforeAll, vi } from "vitest";
import { render } from "../../../test-utils/render";
import {
  DatePickerInput,
  getDateTimeInputParts,
  getChangedDateInputValue,
  normalizeDateInputValue,
} from "../DatePickerInput";

beforeAll(() => {
  const storage = {
    clear: vi.fn(),
    getItem: vi.fn(() => null),
    key: vi.fn(() => null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
    length: 0,
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: storage,
  });
});

function ControlledDatePickerInput({
  onValueChange,
}: {
  onValueChange: (value: string) => void;
}) {
  const [value, setValue] = useState("2026-03-30");

  return createElement(DatePickerInput, {
    value,
    onValueChange: (nextValue: string) => {
      setValue(nextValue);
      onValueChange(nextValue);
    },
    triggerLabel: "Pick date",
    inputProps: {
      "aria-label": "Date",
    },
  });
}

function ControlledDateTimePickerInput({
  onValueChange,
}: {
  onValueChange: (value: string) => void;
}) {
  const [value, setValue] = useState("2026-03-30T12:00");
  const { date, time } = getDateTimeInputParts(value);
  const commitValue = (nextValue: string) => {
    setValue(nextValue);
    onValueChange(nextValue);
  };

  return createElement(DatePickerInput, {
    value,
    onValueChange: (nextDate: string) => {
      commitValue(`${nextDate}T${time || "12:00"}`);
    },
    triggerLabel: "Pick deadline",
    closeOnSelect: false,
    format: (selectedDate: { toString(): string }) =>
      `${selectedDate.toString()} ${time || "12:00"}`,
    inputProps: {
      "aria-label": "Deadline",
    },
    contentEndElement: ({ close }: { close: () => void }) =>
      createElement(
        "div",
        {},
        ["13:00", "14:00"].map((timeOption) =>
          createElement(
            "button",
            {
              key: timeOption,
              type: "button",
              onClick: () => {
                commitValue(`${date}T${timeOption}`);
                close();
              },
            },
            timeOption,
          ),
        ),
      ),
  });
}

describe("normalizeDateInputValue", () => {
  test("returns an empty string for missing values", () => {
    expect(normalizeDateInputValue(undefined)).toBe("");
  });

  test("keeps date-only values unchanged", () => {
    expect(normalizeDateInputValue("2026-03-30")).toBe("2026-03-30");
  });

  test("strips the time portion from datetime-local values", () => {
    expect(normalizeDateInputValue("2026-03-30T18:13")).toBe("2026-03-30");
  });

  test("strips the time portion from space-separated datetime values", () => {
    expect(normalizeDateInputValue("2026-06-18 12:00")).toBe("2026-06-18");
  });

  test("returns an empty string for invalid date values", () => {
    expect(normalizeDateInputValue("not a date")).toBe("");
  });
});

describe("getDateTimeInputParts", () => {
  test("extracts date and time from datetime-local values", () => {
    expect(getDateTimeInputParts("2026-03-30T18:13")).toEqual({
      date: "2026-03-30",
      time: "18:13",
    });
  });

  test("extracts date and time from space-separated datetime values", () => {
    expect(getDateTimeInputParts("2026-06-18 12:00")).toEqual({
      date: "2026-06-18",
      time: "12:00",
    });
  });

  test("keeps the date portion from malformed datetime suffixes", () => {
    expect(getDateTimeInputParts("2026-06-18 12:0:null")).toEqual({
      date: "2026-06-18",
      time: "",
    });
  });
});

describe("getChangedDateInputValue", () => {
  test("returns the next value when the selected date changed", () => {
    expect(getChangedDateInputValue("2026-03-30", "2026-03-31")).toBe(
      "2026-03-31",
    );
  });

  test("normalizes datetime next values to date-only values", () => {
    expect(getChangedDateInputValue("2026-03-30", "2026-03-31T18:13")).toBe(
      "2026-03-31",
    );
  });

  test("ignores locale-formatted display values", () => {
    expect(getChangedDateInputValue("2026-03-30", "03/31/2026")).toBe(null);
  });

  test("returns an empty string when a value is cleared", () => {
    expect(getChangedDateInputValue("2026-03-30", "")).toBe("");
  });

  test("ignores same-date emissions from datetime-local values", () => {
    expect(getChangedDateInputValue("2026-03-30T18:13", "2026-03-30")).toBe(
      null,
    );
  });

  test("ignores same-date emissions from space-separated datetime values", () => {
    expect(getChangedDateInputValue("2026-03-30 18:13", "2026-03-30")).toBe(
      null,
    );
  });

  test("uses the clicked date when the controlled picker emits the current value first", () => {
    expect(
      getChangedDateInputValue("2026-03-30T18:13", "2026-03-30", "2026-03-31"),
    ).toBe("2026-03-31");
  });

  test("uses the focused date when no clicked date was captured", () => {
    expect(
      getChangedDateInputValue(
        "2026-03-30T18:13",
        "2026-03-30",
        null,
        "2026-03-31",
      ),
    ).toBe("2026-03-31");
  });
});

describe("DatePickerInput", () => {
  test("emits the clicked day on the first controlled date selection", async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn<(value: string) => void>();

    render(
      createElement(ControlledDatePickerInput, {
        onValueChange: handleValueChange,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Pick date" }));

    const nextDay = await waitFor(() => {
      const dayElement = document.querySelector(
        '[data-value="2026-03-31"][role="button"]',
      );

      expect(dayElement).not.toBeNull();

      return dayElement as HTMLElement;
    });

    await user.click(nextDay);

    expect(handleValueChange).toHaveBeenCalledWith("2026-03-31");
  });

  test("updates the displayed time on each controlled time selection", async () => {
    const user = userEvent.setup();
    const handleValueChange = vi.fn<(value: string) => void>();

    render(
      createElement(ControlledDateTimePickerInput, {
        onValueChange: handleValueChange,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Pick deadline" }));
    await user.click(screen.getByRole("button", { name: "13:00" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Deadline")).toHaveValue("2026-03-30 13:00"),
    );

    await user.click(screen.getByRole("button", { name: "Pick deadline" }));
    await user.click(screen.getByRole("button", { name: "14:00" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Deadline")).toHaveValue("2026-03-30 14:00"),
    );
    expect(handleValueChange).toHaveBeenLastCalledWith("2026-03-30T14:00");
  });
});
