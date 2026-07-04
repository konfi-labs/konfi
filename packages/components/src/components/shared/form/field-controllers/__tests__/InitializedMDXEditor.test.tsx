import "@testing-library/jest-dom";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import InitializedMDXEditor from "../InitializedMDXEditor";

const mockImagePlugin = vi.fn(() => ({}));
const mockUploadMdxImage = vi.fn(async () => ({
  storagePath: "images/cms/blog/test-image.png",
  url: "https://cdn.test/cms/blog/test-image.png",
}));
vi.mock("@konfi/firebase", () => ({
  uploadMdxImage: (...args: unknown[]) => mockUploadMdxImage(...args),
}));

vi.mock("@mdxeditor/editor", async () => {
  const { forwardRef } = await import("react");

  const MockMDXEditor = forwardRef<HTMLDivElement, { markdown?: string }>(
    function MockMDXEditor({ markdown }, ref) {
      return <div data-markdown={markdown ?? ""} data-testid="mdx-editor" ref={ref} />;
    },
  );

  const MockToolbarWrapper = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  return {
    BlockTypeSelect: () => null,
    BoldItalicUnderlineToggles: () => null,
    CreateLink: () => null,
    DiffSourceToggleWrapper: MockToolbarWrapper,
    InsertImage: () => null,
    InsertTable: () => null,
    InsertThematicBreak: () => null,
    ListsToggle: () => null,
    MDXEditor: MockMDXEditor,
    UndoRedo: () => null,
    diffSourcePlugin: () => ({}),
    headingsPlugin: () => ({}),
    imagePlugin: (...args: unknown[]) => mockImagePlugin(...args),
    linkDialogPlugin: () => ({}),
    linkPlugin: () => ({}),
    listsPlugin: () => ({}),
    markdownShortcutPlugin: () => ({}),
    quotePlugin: () => ({}),
    tablePlugin: () => ({}),
    thematicBreakPlugin: () => ({}),
    toolbarPlugin: () => ({}),
  };
});

vi.mock("../MdxPreview", () => ({
  Preview: ({ source }: { source?: string }) => (
    <div data-testid="mdx-preview">{source ?? ""}</div>
  ),
}));

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as TFunction;

describe("InitializedMDXEditor", () => {
  it("normalizes undefined markdown to an empty string", () => {
    mockImagePlugin.mockClear();
    mockUploadMdxImage.mockClear();

    render(
      <ChakraProvider value={defaultSystem}>
        <InitializedMDXEditor editorRef={null} markdown={undefined} t={t} />
      </ChakraProvider>,
    );

    expect(screen.getByTestId("mdx-editor")).toHaveAttribute("data-markdown", "");
    expect(screen.getByTestId("mdx-preview")).toBeEmptyDOMElement();
  });

  it("configures image uploads for pasted or inserted images", async () => {
    mockImagePlugin.mockClear();
    mockUploadMdxImage.mockClear();

    render(
      <ChakraProvider value={defaultSystem}>
        <InitializedMDXEditor
          editorRef={null}
          fieldData={{
            mdxImageProps: {
              prefix: "cms/blog",
            },
            name: "content",
          }}
          markdown={"# Hello"}
          t={t}
        />
      </ChakraProvider>,
    );

    expect(mockImagePlugin).toHaveBeenCalled();

    const imagePluginOptions = mockImagePlugin.mock.calls.at(-1)?.[0] as {
      imageUploadHandler: (file: File) => Promise<string>;
    };
    const uploadedUrl = await imagePluginOptions.imageUploadHandler(
      new File(["image"], "test-image.png", { type: "image/png" }),
    );

    expect(mockUploadMdxImage).toHaveBeenCalledWith({
      file: expect.any(File),
      prefix: "cms/blog",
    });
    expect(uploadedUrl).toBe("https://cdn.test/cms/blog/test-image.png");
  });

  it("accepts images by uppercase extension or MIME type", async () => {
    mockImagePlugin.mockClear();
    mockUploadMdxImage.mockClear();

    render(
      <ChakraProvider value={defaultSystem}>
        <InitializedMDXEditor editorRef={null} markdown={"# Hello"} t={t} />
      </ChakraProvider>,
    );

    const imagePluginOptions = mockImagePlugin.mock.calls.at(-1)?.[0] as {
      imageUploadHandler: (file: File) => Promise<string>;
    };

    await expect(
      imagePluginOptions.imageUploadHandler(
        new File(["image"], "UPPERCASE.PNG", { type: "" }),
      ),
    ).resolves.toBe("https://cdn.test/cms/blog/test-image.png");

    await expect(
      imagePluginOptions.imageUploadHandler(
        new File(["image"], "no-extension", { type: "image/png" }),
      ),
    ).resolves.toBe("https://cdn.test/cms/blog/test-image.png");
  });

  it("rejects unsupported image types", async () => {
    mockImagePlugin.mockClear();
    mockUploadMdxImage.mockClear();

    render(
      <ChakraProvider value={defaultSystem}>
        <InitializedMDXEditor editorRef={null} markdown={"# Hello"} t={t} />
      </ChakraProvider>,
    );

    const imagePluginOptions = mockImagePlugin.mock.calls.at(-1)?.[0] as {
      imageUploadHandler: (file: File) => Promise<string>;
    };

    await expect(
      imagePluginOptions.imageUploadHandler(
        new File(["image"], ".gitignore", { type: "text/plain" }),
      ),
    ).rejects.toThrow("Unsupported image type");

    expect(mockUploadMdxImage).not.toHaveBeenCalled();
  });
});
