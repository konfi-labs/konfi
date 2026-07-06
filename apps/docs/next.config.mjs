import nextra from "nextra";

const locales = ["en", "pl", "de", "fr", "cs", "sk", "uk"];
const noScriptNextThemes = "./lib/no-script-next-themes.tsx";
const storybookDevUrl = (
  process.env.DOCS_STORYBOOK_PROXY_URL ??
  `http://localhost:${process.env.STORYBOOK_PORT ?? "6006"}`
).replace(/\/$/, "");
const shouldProxyStorybook =
  process.env.NODE_ENV !== "production" ||
  Boolean(process.env.DOCS_STORYBOOK_PROXY_URL);
const localePattern = locales.join("|");
const storybookRuntimeRewrites = [
  {
    source: "/:storybookEntry(vite-inject-mocker-entry\\.js)",
    destination: `${storybookDevUrl}/:storybookEntry`,
  },
  {
    source: "/@vite/:path*",
    destination: `${storybookDevUrl}/@vite/:path*`,
  },
  {
    source: "/@id/:path*",
    destination: `${storybookDevUrl}/@id/:path*`,
  },
  {
    source: "/@fs/:path*",
    destination: `${storybookDevUrl}/@fs/:path*`,
  },
  {
    source: "/node_modules/:path*",
    destination: `${storybookDevUrl}/node_modules/:path*`,
  },
  {
    source: "/.storybook/:path*",
    destination: `${storybookDevUrl}/.storybook/:path*`,
  },
  {
    source: "/src/:path*",
    destination: `${storybookDevUrl}/src/:path*`,
  },
];
const localeStorybookRuntimeRewrites = storybookRuntimeRewrites.map(
  ({ source, destination }) => ({
    source: `/:lang(${localePattern})${source}`,
    destination,
    locale: false,
  }),
);

/** @type {import("next").NextConfig} */
const nextConfig = {
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  reactStrictMode: true,
  i18n: {
    locales,
    defaultLocale: "en",
  },
  turbopack: {
    resolveAlias: {
      "next-themes": noScriptNextThemes,
    },
  },
  async rewrites() {
    if (!shouldProxyStorybook) {
      return [];
    }

    return {
      beforeFiles: [
        ...storybookRuntimeRewrites,
        ...localeStorybookRuntimeRewrites,
        {
          source: "/storybook",
          destination: `${storybookDevUrl}/`,
        },
        {
          source: "/storybook/:path*",
          destination: `${storybookDevUrl}/:path*`,
        },
        {
          source: `/:lang(${localePattern})/storybook`,
          destination: `${storybookDevUrl}/`,
          locale: false,
        },
        {
          source: `/:lang(${localePattern})/storybook/:path*`,
          destination: `${storybookDevUrl}/:path*`,
          locale: false,
        },
      ],
    };
  },
};

const withNextra = nextra({});

export default withNextra(nextConfig);
