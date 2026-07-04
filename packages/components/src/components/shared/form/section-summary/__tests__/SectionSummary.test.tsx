import "@testing-library/jest-dom";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormData } from "@konfi/types";
import { createInstance } from "i18next";
import { type ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { SectionSummary } from "../SectionSummary";

const testI18n = createInstance();

beforeAll(async () => {
  await testI18n.init({
    lng: "en",
    resources: { en: { translation: {} } },
  });
});

const t = testI18n.t.bind(testI18n);

type Section = FormData["sections"][number];

const detailsSection: Section = {
  fieldArray: false,
  heading: "Details",
  fields: [
    { name: "name", label: "Name" },
    { name: "notes", label: "Notes" },
  ],
};

function Wrapper({
  defaultValues,
  children,
}: {
  defaultValues: Record<string, unknown>;
  children: (helpers: {
    setError: (name: string) => void;
  }) => ReactNode;
}) {
  const methods = useForm({ defaultValues });
  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>
        {children({
          setError: (name) =>
            methods.setError(name, { type: "manual", message: "Required" }),
        })}
      </FormProvider>
    </ChakraProvider>
  );
}

describe("SectionSummary", () => {
  test("shows filled fields, hides empty ones, and reports the count", () => {
    render(
      <Wrapper defaultValues={{ name: "Acme", notes: "" }}>
        {() => (
          <SectionSummary
            section={detailsSection}
            onEdit={() => {}}
            t={t}
            i18n={testI18n}
          />
        )}
      </Wrapper>,
    );

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    // The empty "notes" field is excluded from the preview.
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 filled")).toBeInTheDocument();
  });

  test("renders an empty state when nothing is filled", () => {
    render(
      <Wrapper defaultValues={{ name: "", notes: "" }}>
        {() => (
          <SectionSummary
            section={detailsSection}
            onEdit={() => {}}
            t={t}
            i18n={testI18n}
          />
        )}
      </Wrapper>,
    );

    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 filled")).toBeInTheDocument();
  });

  test("expands the section when the card is activated", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <Wrapper defaultValues={{ name: "Acme", notes: "" }}>
        {() => (
          <SectionSummary
            section={detailsSection}
            onEdit={onEdit}
            t={t}
            i18n={testI18n}
          />
        )}
      </Wrapper>,
    );

    await user.click(
      screen.getByRole("button", { name: /show and edit section/i }),
    );
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test("surfaces a validation error badge for collapsed fields", async () => {
    const user = userEvent.setup();

    render(
      <Wrapper defaultValues={{ name: "Acme", notes: "" }}>
        {({ setError }) => (
          <>
            <button type="button" onClick={() => setError("notes")}>
              trigger error
            </button>
            <SectionSummary
              section={detailsSection}
              onEdit={() => {}}
              t={t}
              i18n={testI18n}
            />
          </>
        )}
      </Wrapper>,
    );

    expect(screen.queryByText("1 error(s)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /trigger error/i }));
    expect(screen.getByText("1 error(s)")).toBeInTheDocument();
  });

  test("summarizes array sections by item count", () => {
    const arraySection: Section = {
      fieldArray: true,
      name: "items",
      heading: "Items",
      fields: [{ name: "title", label: "Title" }],
    };

    render(
      <Wrapper defaultValues={{ items: [{ title: "A" }, { title: "B" }] }}>
        {() => (
          <SectionSummary
            section={arraySection}
            onEdit={() => {}}
            t={t}
            i18n={testI18n}
          />
        )}
      </Wrapper>,
    );

    expect(screen.getByText("2 item(s)")).toBeInTheDocument();
  });
});
