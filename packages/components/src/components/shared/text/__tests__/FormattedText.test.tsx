import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import { render } from "../../../test-utils/render";
import { FormattedText } from "../FormattedText";

test("renders plain text correctly", () => {
  render(<FormattedText>Hello world</FormattedText>);
  expect(screen.getByText("Hello world")).toBeInTheDocument();
});

test("preserves line breaks", () => {
  const text = "Line 1\nLine 2\nLine 3";
  render(<FormattedText>{text}</FormattedText>);
  const brs = document.querySelectorAll("br");
  expect(brs).toHaveLength(2); // 2 <br> for 3 lines
});

test("renders bold text with **", () => {
  const text = "This is **bold** text";
  render(<FormattedText>{text}</FormattedText>);
  const bold = screen.getByText("bold");
  expect(bold.tagName).toBe("STRONG");
});

test("renders italic text with *", () => {
  const text = "This is *italic* text";
  render(<FormattedText>{text}</FormattedText>);
  const italic = screen.getByText("italic");
  expect(italic.tagName).toBe("EM");
});

test("handles empty or null text", () => {
  const { container } = render(<FormattedText>{""}</FormattedText>);
  expect(container.innerHTML).toBe("");
});

test("handles mixed formatting", () => {
  const text = "Normal **bold** and *italic* text\nWith line breaks";
  render(<FormattedText>{text}</FormattedText>);
  const bold = screen.getByText("bold");
  const italic = screen.getByText("italic");
  const br = document.querySelector("br");
  expect(bold.tagName).toBe("STRONG");
  expect(italic.tagName).toBe("EM");
  expect(br).toBeTruthy();
});
