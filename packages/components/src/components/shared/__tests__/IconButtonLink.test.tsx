import "@testing-library/jest-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentPropsWithoutRef } from "react";
import { vi } from "vitest";
import { render } from "../../test-utils/render";
import { IconButtonLink } from "../IconButtonLink";

vi.mock("next/link", async () => {
  const React = await import("react");

  const MockNextLink = React.forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<"a"> & { href: string | URL }
  >(({ href, children, ...props }, ref) => (
    <a
      ref={ref}
      href={typeof href === "string" ? href : href.toString()}
      {...props}
    >
      {children}
    </a>
  ));

  MockNextLink.displayName = "MockNextLink";

  return { default: MockNextLink };
});

describe("IconButtonLink", () => {
  test("renders a single link element instead of nesting a button inside an anchor", () => {
    const { container } = render(
      <IconButtonLink
        lng="en"
        href="/orders/123"
        icon="open_in_new"
        ariaLabel="Preview order"
        tooltipLabel="Preview order"
      />,
    );

    const link = screen.getByRole("link", { name: "Preview order" });

    expect(link).toHaveAttribute("href", "/en/orders/123");
    expect(container.querySelector("a button")).toBeNull();
  });

  test("does not locale-prefix absolute links", () => {
    render(
      <IconButtonLink
        lng="en"
        href="https://www.example.com/products"
        icon="open_in_new"
        ariaLabel="Open products"
      />,
    );

    expect(screen.getByRole("link", { name: "Open products" })).toHaveAttribute(
      "href",
      "https://www.example.com/products",
    );
  });

  test("renders a disabled icon button without a link when disabled", () => {
    render(
      <IconButtonLink
        href="/orders/123"
        icon="open_in_new"
        ariaLabel="Preview order"
        disabled={true}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Preview order" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview order" }),
    ).toBeDisabled();
  });

  test("closes the tooltip when the link is clicked", async () => {
    const user = userEvent.setup();

    render(
      <IconButtonLink
        lng="en"
        href="/orders/123"
        icon="open_in_new"
        ariaLabel="Preview order"
        tooltipLabel="Preview order"
      />,
    );

    const link = screen.getByRole("link", { name: "Preview order" });

    await user.hover(link);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Preview order",
    );

    await user.click(link);

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});
