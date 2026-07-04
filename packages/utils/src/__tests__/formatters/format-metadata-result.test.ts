import { formatMetadataResult } from "../../formatters/format-metadata-result";
import { dbMetadata } from "@konfi/types";

describe("formatMetadataResult", () => {
  it("should format metadata correctly", () => {
    const input: dbMetadata = {
      id: "",
      title: "Page Title",
      description: "Page Description",
      keywords: "keyword1, keyword2",
      ogTitle: "OpenGraph Title",
      ogDescription: "OpenGraph Description",
    };

    const expected = {
      title: "Page Title",
      description: "Page Description",
      keywords: "keyword1, keyword2",
      openGraph: {
        title: "OpenGraph Title",
        description: "OpenGraph Description",
      },
      twitter: {
        title: "OpenGraph Title",
        description: "OpenGraph Description",
      },
    };

    expect(formatMetadataResult(input)).toEqual(expected);
  });

  it("should handle empty metadata values", () => {
    const input: dbMetadata = {
      id: "",
      title: "",
      description: "",
      keywords: "",
      ogTitle: "",
      ogDescription: "",
    };

    const expected = {
      title: undefined,
      description: undefined,
      keywords: undefined,
      openGraph: undefined,
      twitter: undefined,
    };

    expect(formatMetadataResult(input)).toEqual(expected);
  });

  it("should handle undefined metadata values", () => {
    const input = {
      title: "Page Title",
      description: undefined,
      keywords: "keyword1, keyword2",
      ogTitle: undefined,
      ogDescription: "OpenGraph Description",
    } as unknown as dbMetadata;

    const expected = {
      title: "Page Title",
      description: undefined,
      keywords: "keyword1, keyword2",
      openGraph: {
        title: undefined,
        description: "OpenGraph Description",
      },
      twitter: {
        title: undefined,
        description: "OpenGraph Description",
      },
    };

    expect(formatMetadataResult(input)).toEqual(expected);
  });

  it("should treat whitespace-only values as missing metadata", () => {
    const input = {
      id: "",
      title: "   ",
      description: "\n\t",
      keywords: " ",
      ogTitle: "  ",
      ogDescription: " ",
    } as dbMetadata;

    expect(formatMetadataResult(input)).toEqual({
      title: undefined,
      description: undefined,
      keywords: undefined,
      openGraph: undefined,
      twitter: undefined,
    });
  });

  it("should include social preview images when metadata has an ogImage", () => {
    const input: dbMetadata = {
      id: "",
      title: "Page Title",
      description: "Page Description",
      keywords: "keyword1, keyword2",
      ogTitle: "OpenGraph Title",
      ogDescription: "OpenGraph Description",
      ogImage: "https://cdn.example.com/share.png",
    };

    expect(formatMetadataResult(input)).toEqual({
      title: "Page Title",
      description: "Page Description",
      keywords: "keyword1, keyword2",
      openGraph: {
        title: "OpenGraph Title",
        description: "OpenGraph Description",
        images: [
          {
            height: 630,
            url: "https://cdn.example.com/share.png",
            width: 1200,
          },
        ],
      },
      twitter: {
        title: "OpenGraph Title",
        description: "OpenGraph Description",
        card: "summary_large_image",
        images: ["https://cdn.example.com/share.png"],
      },
    });
  });
});
