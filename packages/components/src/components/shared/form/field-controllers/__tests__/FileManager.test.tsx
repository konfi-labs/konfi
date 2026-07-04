import "@testing-library/jest-dom";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { FieldData } from "@konfi/types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TFunction } from "i18next";
import type { ImgHTMLAttributes } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, test, vi } from "vitest";
import FileManager from "../FileManager";

const firebaseMocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  download: vi.fn(),
  list: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@konfi/firebase", () => ({
  deleteObject: firebaseMocks.deleteObject,
  download: firebaseMocks.download,
  list: firebaseMocks.list,
  upload: firebaseMocks.upload,
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    blurDataURL: _blurDataURL,
    fill: _fill,
    loader: _loader,
    placeholder: _placeholder,
    preload: _preload,
    quality: _quality,
    src,
    unoptimized: _unoptimized,
    ...rest
  }: ImgHTMLAttributes<HTMLImageElement> & {
    blurDataURL?: string;
    fill?: boolean;
    loader?: unknown;
    placeholder?: string;
    preload?: boolean;
    quality?: number;
    src: string;
    unoptimized?: boolean;
  }) => <img alt={alt} src={src} {...rest} />,
}));

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as TFunction;

const fieldData: FieldData = {
  name: "images",
  type: "fileManager",
  imageProps: {
    prefix: "channels/channel-1/products/product-1",
    includePrefix: false,
    maxNumber: 5,
  },
};

function CurrentValue() {
  const value = useWatch({ name: fieldData.name });

  return <pre data-testid="current-value">{JSON.stringify(value)}</pre>;
}

function TestWrapper({
  defaultValues,
}: {
  defaultValues: { images: string[] | string };
}) {
  const methods = useForm({
    defaultValues,
  });

  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <ChakraProvider value={defaultSystem}>
        <FormProvider {...methods}>
          <FileManager fieldData={fieldData} t={t} />
          <CurrentValue />
        </FormProvider>
      </ChakraProvider>
    </SWRConfig>
  );
}

function CompactTriggerWrapper() {
  const methods = useForm({
    defaultValues: {
      images: [],
    },
  });

  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <ChakraProvider value={defaultSystem}>
        <FormProvider {...methods}>
          <FileManager
            fieldData={fieldData}
            t={t}
            triggerAriaLabel="Choose product images"
            triggerContent={<span>Files</span>}
            triggerSize="xs"
          />
        </FormProvider>
      </ChakraProvider>
    </SWRConfig>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_CDN_URL = "cdn.test";
  firebaseMocks.deleteObject.mockResolvedValue(undefined);
  firebaseMocks.download.mockResolvedValue(undefined);
  firebaseMocks.list.mockResolvedValue([]);
  firebaseMocks.upload.mockResolvedValue(undefined);
});

describe("FileManager", () => {
  test("supports a custom compact trigger while keeping the file dialog accessible", async () => {
    const user = userEvent.setup();

    render(<CompactTriggerWrapper />);

    await user.click(
      screen.getByRole("button", { name: "Choose product images" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Select files" }),
      ).toBeInTheDocument();
    });
  });

  test("keeps orphaned selected images removable when they are missing from the current folder", async () => {
    const user = userEvent.setup();

    firebaseMocks.list.mockResolvedValue([
      {
        fullPath: "images/channels/channel-1/products/product-1/new.png",
        name: "new.png",
      },
    ]);

    render(<TestWrapper defaultValues={{ images: ["legacy.png"] }} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Selected image is no longer available in this folder",
        ),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByText("Selected image is no longer available in this folder"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-value")).toHaveTextContent("[]");
    });
  });

  test("matches legacy stored paths to the current folder listing", async () => {
    const user = userEvent.setup();

    firebaseMocks.list.mockResolvedValue([
      {
        fullPath: "images/channels/channel-1/products/product-1/legacy.png",
        name: "legacy.png",
      },
    ]);

    render(
      <TestWrapper
        defaultValues={{
          images: ["channels/channel-1/products/product-1/legacy.png"],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Loaded image")).toBeInTheDocument();
    });

    await user.click(screen.getByAltText("Loaded image"));

    await waitFor(() => {
      expect(screen.getByTestId("current-value")).toHaveTextContent("[]");
    });
  });

  test("removes a selected image from form state after deleting it from storage", async () => {
    const user = userEvent.setup();

    firebaseMocks.list
      .mockResolvedValueOnce([
        {
          fullPath: "images/channels/channel-1/products/product-1/legacy.png",
          name: "legacy.png",
        },
      ])
      .mockResolvedValueOnce([]);

    render(<TestWrapper defaultValues={{ images: ["legacy.png"] }} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Delete")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Delete"));

    await waitFor(() => {
      expect(firebaseMocks.deleteObject).toHaveBeenCalledWith(
        "images/channels/channel-1/products/product-1/legacy.png",
      );
      expect(screen.getByTestId("current-value")).toHaveTextContent("[]");
    });
  });

  test("selects uploaded images in form state immediately after upload", async () => {
    const user = userEvent.setup();

    firebaseMocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        fullPath: "images/channels/channel-1/products/product-1/fresh.png",
        name: "fresh.png",
      },
    ]);

    render(<TestWrapper defaultValues={{ images: [] }} />);

    await user.click(screen.getByRole("button", { name: "Select files" }));
    await user.click(screen.getByRole("tab", { name: /Upload files/i }));

    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');

    expect(input).not.toBeNull();

    const file = new File(["image"], "fresh.png", { type: "image/png" });
    await user.upload(input!, file);

    await waitFor(() => {
      expect(firebaseMocks.upload).toHaveBeenCalledWith([
        {
          file,
          url: "images/channels/channel-1/products/product-1/fresh.png",
        },
      ]);
      expect(screen.getByTestId("current-value")).toHaveTextContent(
        '["fresh.png"]',
      );
    });
  });
});
