import "@testing-library/jest-dom";
import type { ComponentPropsWithoutRef } from "react";
import { vi } from "vitest";
import { render } from "../../test-utils/render";
import { Card } from "../Card";

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

describe("Card", () => {
  it("places onboarding target on linked card content", () => {
    const { container } = render(
      <Card
        icon="share"
        route="/configuration/channels"
        title="Channels"
        onboardingId="config-channels"
      />,
    );

    const target = container.querySelector(
      "[data-onboarding-id='config-channels']",
    );

    expect(target).toBeInTheDocument();
    expect(target?.closest("a")).toHaveAttribute(
      "href",
      "/configuration/channels",
    );
  });
});
