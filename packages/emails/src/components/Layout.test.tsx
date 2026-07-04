import { render, Text } from "react-email";
import { describe, expect, it } from "vitest";
import { Layout } from "./Layout";

const normalizeRenderedHtml = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("Layout", () => {
  it("inlines Tailwind classes with the shared email color tokens", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <Layout>
          <Text className="font-bold text-primary-dark">Tailwind content</Text>
        </Layout>,
      ),
    );

    expect(html).toContain("Tailwind content");
    expect(html).toContain("font-weight:700");
    // Default admin brand uses neutral near-black for primary-dark.
    expect(html).toContain("color:rgb(0,0,0)");
  });

  it("renders the Konfi admin email shell with square edges", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <Layout brand="admin">
          <Text>Container content</Text>
        </Layout>,
      ),
    );

    expect(html).toContain("border-radius:0");
    expect(html).not.toContain("border-radius:28px");
    expect(html).not.toContain("border-radius:24px");
  });

  it("keeps the customer-facing store email shell rounded", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <Layout brand="store">
          <Text>Container content</Text>
        </Layout>,
      ),
    );

    expect(html).toContain("border-radius:24px");
  });

  it("renders the customer-facing store email shell with a border", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <Layout brand="store">
          <Text>Container content</Text>
        </Layout>,
      ),
    );

    expect(html).toContain("border:1px solid #e7e5e4");
  });
});
