import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldData } from "@konfi/types";
import { i18n, TFunction } from "i18next";
import { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AddressAutocompleteFieldController,
  createGooglePlacesSessionToken,
} from "../AddressAutocomplete";

const fieldData: FieldData = {
  name: "shipping.street",
  placeholder: "Street",
  autocomplete: "street-address",
};

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as TFunction;

const i18next = {
  language: "en",
  resolvedLanguage: "en",
} as i18n;

const toaster = {
  create: vi.fn(),
};

function TestWrapper({ children }: { children: ReactNode }) {
  const methods = useForm({
    defaultValues: {
      shipping: {
        street: "",
        number: "",
        local: "",
        zip: "",
        city: "",
        country: "Poland",
      },
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>{children}</FormProvider>
    </ChakraProvider>
  );
}

describe("AddressAutocompleteFieldController", () => {
  beforeEach(() => {
    toaster.create.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders Google place suggestions after typing a street query", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            suggestions: [
              {
                place: "places/example",
                placeId: "example",
                label: "Example Street 10, Example City, Poland",
                mainText: "Example Street 10",
                secondaryText: "Example City, Poland",
              },
            ],
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TestWrapper>
        <AddressAutocompleteFieldController
          disabled={false}
          fieldData={fieldData}
          i18n={i18next}
          t={t}
          toaster={toaster}
        />
      </TestWrapper>,
    );

    await userEvent.type(screen.getByRole("combobox"), "Example");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/google/places/autocomplete",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByText("Example Street 10")).toBeInTheDocument();
      expect(screen.getByText("Example City, Poland")).toBeInTheDocument();
    });
  });

  it("creates Google-compatible fallback session tokens", () => {
    const originalCrypto = globalThis.crypto;
    const fallbackCrypto = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint8Array) {
          array.fill(1);
        }

        return array;
      },
    } as Crypto;

    vi.stubGlobal("crypto", fallbackCrypto);

    const token = createGooglePlacesSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{1,36}$/);
    expect(token).toHaveLength(22);

    vi.stubGlobal("crypto", originalCrypto);
  });
});
