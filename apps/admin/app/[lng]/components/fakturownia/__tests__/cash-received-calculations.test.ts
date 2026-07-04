import { describe, expect, it } from "vitest";
import {
  calculateCashBaseAmount,
  calculateCashChangeDue,
  handleNumpadKey,
  normalizeDisplayTotal,
  parseCashReceivedInput,
  sanitizeCashReceivedInput,
} from "../cash-calculations";

describe("Cash Received Calculations", () => {
  describe("parseCashReceivedInput", () => {
    it("returns 0 for empty string", () => {
      expect(parseCashReceivedInput("")).toBe(0);
    });

    it("parses valid numeric strings", () => {
      expect(parseCashReceivedInput("100")).toBe(100);
      expect(parseCashReceivedInput("100.50")).toBe(100.5);
      expect(parseCashReceivedInput("0.99")).toBe(0.99);
    });

    it("normalizes comma decimal separators to dots", () => {
      expect(parseCashReceivedInput("100,50")).toBe(100.5);
      expect(parseCashReceivedInput("1,234")).toBe(1.234);
    });

    it("returns 0 for invalid input", () => {
      expect(parseCashReceivedInput("abc")).toBe(0);
      expect(parseCashReceivedInput("--")).toBe(0);
    });

    it("handles edge cases", () => {
      expect(parseCashReceivedInput("0")).toBe(0);
      expect(parseCashReceivedInput("0.00")).toBe(0);
      expect(parseCashReceivedInput(".5")).toBe(0.5);
    });
  });

  describe("calculateCashBaseAmount", () => {
    it("uses paidAmount when it is greater than 0", () => {
      expect(calculateCashBaseAmount(50, 100)).toBe(50);
      expect(calculateCashBaseAmount(0.01, 1000)).toBe(0.01);
    });

    it("uses totalsGross when paidAmount is 0", () => {
      expect(calculateCashBaseAmount(0, 100)).toBe(100);
    });

    it("uses totalsGross when paidAmount is negative", () => {
      expect(calculateCashBaseAmount(-10, 100)).toBe(100);
    });

    it("handles zero totalsGross", () => {
      expect(calculateCashBaseAmount(0, 0)).toBe(0);
    });
  });

  describe("calculateCashChangeDue", () => {
    it("calculates positive change when customer gives more", () => {
      expect(calculateCashChangeDue(100, 75.5)).toBe(24.5);
      expect(calculateCashChangeDue(50, 49.99)).toBe(0.01);
    });

    it("calculates negative change when customer gives less", () => {
      expect(calculateCashChangeDue(50, 75)).toBe(-25);
      expect(calculateCashChangeDue(0, 100)).toBe(-100);
    });

    it("returns 0 when exact amount is given", () => {
      expect(calculateCashChangeDue(100, 100)).toBe(0);
      expect(calculateCashChangeDue(49.99, 49.99)).toBe(0);
    });

    it("handles floating-point precision", () => {
      // 100.10 - 100 should be 0.10, not 0.09999999999999432
      expect(calculateCashChangeDue(100.1, 100)).toBe(0.1);
      // 99.99 - 100 should be -0.01, not -0.009999999999990905
      expect(calculateCashChangeDue(99.99, 100)).toBe(-0.01);
    });

    it("handles very small differences", () => {
      // Values smaller than 0.0005 should normalize to 0
      expect(calculateCashChangeDue(100.0001, 100)).toBe(0);
      expect(calculateCashChangeDue(99.9999, 100)).toBe(0);
    });
  });

  describe("normalizeDisplayTotal", () => {
    it("rounds to 2 decimal places", () => {
      expect(normalizeDisplayTotal(100.123)).toBe(100.12);
      expect(normalizeDisplayTotal(100.126)).toBe(100.13);
      expect(normalizeDisplayTotal(100.125)).toBe(100.13);
    });

    it("returns 0 for non-finite values", () => {
      expect(normalizeDisplayTotal(NaN)).toBe(0);
      expect(normalizeDisplayTotal(Infinity)).toBe(0);
      expect(normalizeDisplayTotal(-Infinity)).toBe(0);
    });

    it("converts -0 to 0", () => {
      expect(normalizeDisplayTotal(-0)).toBe(0);
      expect(Object.is(normalizeDisplayTotal(-0), 0)).toBe(true);
    });

    it("converts very small values to 0", () => {
      expect(normalizeDisplayTotal(0.0001)).toBe(0);
      expect(normalizeDisplayTotal(-0.0001)).toBe(0);
      expect(normalizeDisplayTotal(0.0004)).toBe(0);
    });

    it("keeps values >= 0.0005", () => {
      expect(normalizeDisplayTotal(0.01)).toBe(0.01);
      expect(normalizeDisplayTotal(-0.01)).toBe(-0.01);
    });
  });

  describe("sanitizeCashReceivedInput", () => {
    it("allows valid numeric input", () => {
      expect(sanitizeCashReceivedInput("123")).toBe("123");
      expect(sanitizeCashReceivedInput("123.45")).toBe("123.45");
    });

    it("replaces commas with dots", () => {
      expect(sanitizeCashReceivedInput("123,45")).toBe("123.45");
    });

    it("removes non-numeric characters", () => {
      expect(sanitizeCashReceivedInput("$123.45")).toBe("123.45");
      expect(sanitizeCashReceivedInput("abc123def")).toBe("123");
      expect(sanitizeCashReceivedInput("12 34")).toBe("1234");
    });

    it("handles multiple decimal points by joining them", () => {
      expect(sanitizeCashReceivedInput("12.34.56")).toBe("12.3456");
      expect(sanitizeCashReceivedInput("1.2.3.4")).toBe("1.234");
    });

    it("handles edge cases", () => {
      expect(sanitizeCashReceivedInput("")).toBe("");
      expect(sanitizeCashReceivedInput(".")).toBe(".");
      expect(sanitizeCashReceivedInput("...")).toBe(".");
    });
  });

  describe("handleNumpadKey", () => {
    describe("clear key", () => {
      it("clears the input", () => {
        expect(handleNumpadKey("123.45", "clear")).toBe("");
        expect(handleNumpadKey("", "clear")).toBe("");
      });
    });

    describe("backspace key", () => {
      it("removes the last character", () => {
        expect(handleNumpadKey("123", "backspace")).toBe("12");
        expect(handleNumpadKey("12.3", "backspace")).toBe("12.");
        expect(handleNumpadKey("1", "backspace")).toBe("");
      });

      it("handles empty input", () => {
        expect(handleNumpadKey("", "backspace")).toBe("");
      });
    });

    describe("decimal point key", () => {
      it("adds 0. when input is empty", () => {
        expect(handleNumpadKey("", ".")).toBe("0.");
      });

      it("appends decimal point to existing digits", () => {
        expect(handleNumpadKey("123", ".")).toBe("123.");
      });

      it("does not add second decimal point", () => {
        expect(handleNumpadKey("12.34", ".")).toBe("12.34");
        expect(handleNumpadKey("12.", ".")).toBe("12.");
      });
    });

    describe("digit keys", () => {
      it("appends digits to the input", () => {
        expect(handleNumpadKey("12", "3")).toBe("123");
        expect(handleNumpadKey("12.3", "4")).toBe("12.34");
      });

      it("replaces leading 0 with digit", () => {
        expect(handleNumpadKey("0", "5")).toBe("5");
      });

      it("does not replace 0 when followed by decimal", () => {
        expect(handleNumpadKey("0.", "5")).toBe("0.5");
      });

      it("handles empty input", () => {
        expect(handleNumpadKey("", "5")).toBe("5");
      });
    });
  });

  describe("integration: full cash change calculation flow", () => {
    it("calculates correct change for a typical transaction", () => {
      const cashReceivedInput = "100";
      const paidAmount = 0;
      const totalsGross = 78.5;

      const cashReceivedValue = parseCashReceivedInput(cashReceivedInput);
      const cashBaseAmount = calculateCashBaseAmount(paidAmount, totalsGross);
      const changeDue = calculateCashChangeDue(cashReceivedValue, cashBaseAmount);

      expect(cashReceivedValue).toBe(100);
      expect(cashBaseAmount).toBe(78.5);
      expect(changeDue).toBe(21.5);
    });

    it("handles partial payment scenario", () => {
      const cashReceivedInput = "50";
      const paidAmount = 50; // Customer already paid 50
      const totalsGross = 100;

      const cashReceivedValue = parseCashReceivedInput(cashReceivedInput);
      const cashBaseAmount = calculateCashBaseAmount(paidAmount, totalsGross);
      const changeDue = calculateCashChangeDue(cashReceivedValue, cashBaseAmount);

      expect(cashReceivedValue).toBe(50);
      expect(cashBaseAmount).toBe(50); // Uses paidAmount, not totalsGross
      expect(changeDue).toBe(0);
    });

    it("shows negative change when customer underpays", () => {
      const cashReceivedInput = "50";
      const paidAmount = 0;
      const totalsGross = 75.99;

      const cashReceivedValue = parseCashReceivedInput(cashReceivedInput);
      const cashBaseAmount = calculateCashBaseAmount(paidAmount, totalsGross);
      const changeDue = calculateCashChangeDue(cashReceivedValue, cashBaseAmount);

      expect(changeDue).toBe(-25.99);
    });

    it("handles numpad entry correctly", () => {
      let input = "";

      // User types 1, 0, 0, ., 5, 0
      input = handleNumpadKey(input, "1");
      expect(input).toBe("1");

      input = handleNumpadKey(input, "0");
      expect(input).toBe("10");

      input = handleNumpadKey(input, "0");
      expect(input).toBe("100");

      input = handleNumpadKey(input, ".");
      expect(input).toBe("100.");

      input = handleNumpadKey(input, "5");
      expect(input).toBe("100.5");

      input = handleNumpadKey(input, "0");
      expect(input).toBe("100.50");

      const cashReceivedValue = parseCashReceivedInput(input);
      expect(cashReceivedValue).toBe(100.5);
    });

    it("handles correction with backspace", () => {
      let input = "120";

      // Mistake: typed 120 instead of 100
      input = handleNumpadKey(input, "backspace");
      input = handleNumpadKey(input, "backspace");
      input = handleNumpadKey(input, "0");
      input = handleNumpadKey(input, "0");

      expect(input).toBe("100");
    });

    it("handles comma decimal input from keyboard", () => {
      // User might type with comma on European keyboard
      const input = sanitizeCashReceivedInput("99,99");
      const value = parseCashReceivedInput(input);

      expect(value).toBe(99.99);
    });
  });
});
