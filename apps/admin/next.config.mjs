/* eslint-disable */
// @ts-check
import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import workflowNext from "workflow/next";

const { withWorkflow } = workflowNext;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Workspace root (apps/admin -> repo root). Required for NFT to follow include
// globs that point outside apps/admin (e.g. into ../../packages/wasm/dist or
// ../../node_modules/.pnpm/pdfjs-dist@*/...).
const workspaceRoot = path.join(__dirname, "..", "..");
const wasmRuntimeTracingFiles = [
  "../../packages/wasm/dist/wasm_bg.wasm",
  "../../packages/wasm/dist/wasm.js",
];
const fakturowniaReportFontFiles = [
  "apps/admin/lib/fakturownia/reports/fonts/GeistMono-Regular.ttf",
  "apps/admin/lib/fakturownia/reports/fonts/GeistMono-SemiBold.ttf",
  "lib/fakturownia/reports/fonts/GeistMono-Regular.ttf",
  "lib/fakturownia/reports/fonts/GeistMono-SemiBold.ttf",
];
const serverlessTracingExcludes = [
  // The admin workspace shares dependencies with the desktop app. NFT can trace
  // Electron's packaged browser runtime through optional server-side dependency
  // edges, but Vercel functions never execute the Electron binary.
  "../../node_modules/.pnpm/electron@*/node_modules/electron/dist/**",
  "../../node_modules/electron/dist/**",
];
const aiGoogleVertexTracingFiles = [
  "apps/admin/node_modules/@ai-sdk/google-vertex/**",
  "node_modules/.pnpm/@ai-sdk+google-vertex@*/node_modules/@ai-sdk/google-vertex/**",
  "node_modules/.pnpm/@ai-sdk+google@*/node_modules/@ai-sdk/google/**",
  "node_modules/.pnpm/@ai-sdk+anthropic@*/node_modules/@ai-sdk/anthropic/**",
  "node_modules/.pnpm/@ai-sdk+openai-compatible@*/node_modules/@ai-sdk/openai-compatible/**",
  "node_modules/.pnpm/@ai-sdk+provider@*/node_modules/@ai-sdk/provider/**",
  "node_modules/.pnpm/@ai-sdk+provider-utils@*/node_modules/@ai-sdk/provider-utils/**",
];
const googleShoppingProductsTracingFiles = [
  "apps/admin/node_modules/@google-shopping/products/**",
  "node_modules/.pnpm/@google-shopping+products@*/node_modules/@google-shopping/products/**",
  "node_modules/.pnpm/google-gax@*/node_modules/google-gax/**",
  "node_modules/.pnpm/@grpc+grpc-js@*/node_modules/@grpc/grpc-js/**",
  "node_modules/.pnpm/@grpc+proto-loader@*/node_modules/@grpc/proto-loader/**",
  "node_modules/.pnpm/duplexify@*/node_modules/duplexify/**",
  "node_modules/.pnpm/google-auth-library@*/node_modules/google-auth-library/**",
  "node_modules/.pnpm/google-logging-utils@*/node_modules/google-logging-utils/**",
  "node_modules/.pnpm/node-fetch@*/node_modules/node-fetch/**",
  "node_modules/.pnpm/object-hash@*/node_modules/object-hash/**",
  "node_modules/.pnpm/proto3-json-serializer@*/node_modules/proto3-json-serializer/**",
  "node_modules/.pnpm/protobufjs@*/node_modules/protobufjs/**",
  "node_modules/.pnpm/retry-request@*/node_modules/retry-request/**",
  "node_modules/.pnpm/rimraf@*/node_modules/rimraf/**",
];
const serverAiRuntimeTracingFiles = [
  ...aiGoogleVertexTracingFiles,
  ...googleShoppingProductsTracingFiles,
];

const cdnHostname = process.env.NEXT_PUBLIC_CDN_URL;

/** @type {string[]} */
const firebaseHostedAuthDomainSuffixes = [".firebaseapp.com", ".web.app"];

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function normalizeHostname(value) {
  if (!value) {
    return "";
  }

  return (
    value
      .trim()
      .replace(/^https?:\/\//, "")
      .split("/")[0] ?? ""
  );
}

function getFirebaseAuthHelperDomain() {
  const authDomain = normalizeHostname(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  );

  if (
    firebaseHostedAuthDomainSuffixes.some((suffix) =>
      authDomain.endsWith(suffix),
    )
  ) {
    return authDomain;
  }

  const projectId = normalizeHostname(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  );

  return projectId ? `${projectId}.firebaseapp.com` : authDomain;
}

function getFirebaseAuthHelperRewrites() {
  const helperDomain = getFirebaseAuthHelperDomain();

  if (!helperDomain) {
    return [];
  }

  return [
    {
      source: "/__/auth/:path*",
      destination: `https://${helperDomain}/__/auth/:path*`,
    },
    {
      source: "/__/firebase/:path*",
      destination: `https://${helperDomain}/__/firebase/:path*`,
    },
  ];
}

/** @type {NonNullable<NonNullable<import("next").NextConfig["images"]>["remotePatterns"]>} */
const cdnRemotePatterns = cdnHostname
  ? [
    {
      protocol: "https",
      hostname: cdnHostname,
      pathname: "**",
    },
  ]
  : [];

/** @type {NonNullable<NonNullable<import("next").NextConfig["images"]>["remotePatterns"]>} */
const remotePatterns = [
  ...cdnRemotePatterns,
  {
    protocol: "https",
    hostname: "firebasestorage.googleapis.com",
    pathname: "**",
  },
  {
    protocol: "https",
    hostname: "imgs.search.brave.com",
    pathname: "**",
  },
  {
    protocol: "https",
    hostname: "avatars.mds.yandex.net",
    pathname: "**",
  },
  {
    protocol: "https",
    hostname: "s.yimg.com",
    pathname: "**",
  },
  {
    protocol: "https",
    hostname: "external-content.duckduckgo.com",
    pathname: "**",
  },
  {
    protocol: "https",
    hostname: "th.bing.com",
    pathname: "**",
  },
  {
    protocol: "https",
    hostname: "www.bing.com",
    pathname: "/images/search/**",
  },
  {
    protocol: "https",
    hostname: "encrypted-tbn*.google.com",
    pathname: "**",
  },
  {
    protocol: "https",
    hostname: "www.google.com",
    pathname: "/imgres/**",
  },
];

/** @type {import('next').NextConfig} */

const nextConfig = {
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  reactStrictMode: true,
  serverExternalPackages: [
    "@napi-rs/canvas",
    "ajv",
    // Keep Google auth / Firebase Admin out of the workflow step-route
    // bundle. The workflow eager builder inlines transitive CJS deps via an
    // esbuild __require shim, which throws "Dynamic require ... is not
    // supported" during Next.js page-data collection for
    // /.well-known/workflow/v1/step. withWorkflow forwards this list to esbuild
    // as `externalPackages`, so listing the package roots keeps them as real
    // require(...) imports at runtime and prevents both the build failure and
    // the workflow-bundle Node.js-builtin serde warnings.
    "@google-shopping/products",
    "ai",
    "firebase-admin",
    "google-auth-library",
    "gaxios",
    "gcp-metadata",
    "google-logging-utils",
    "json-bigint",
    "@google-cloud/vertexai",
    "@google-cloud/aiplatform",
  ],
  transpilePackages: [
    "next-mdx-remote",
    "types",
    "utils",
    "@konfi/emails",
    "@konfi/payments",
  ],
  images: {
    remotePatterns,
  },
  async rewrites() {
    return {
      beforeFiles: getFirebaseAuthHelperRewrites(),
    };
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
          },
        ],
      },
    ];
  },
  reactCompiler: true,
  typedRoutes: true,
  cacheComponents: true,
  partialPrefetching: true,
  // Trace from the monorepo root so `outputFileTracingIncludes` globs that
  // point at workspace packages (e.g. `../../packages/wasm/dist/...`) and
  // hoisted pnpm deps (e.g. `../../node_modules/.pnpm/pdfjs-dist@*/...`)
  // actually resolve. Without this, NFT's default project-relative root
  // silently drops anything outside `apps/admin`.
  outputFileTracingRoot: workspaceRoot,
  // Imposition preview/export routes load binary assets at runtime that
  // Next.js File Tracing (NFT) cannot detect statically:
  //   - `@konfi/wasm` reads `dist/wasm_bg.wasm` as a sibling of its bundled
  //     `wasm.js` via `import.meta.url`.
  //   - `pdfjs-dist` reads `cmaps/`, `standard_fonts/`, and the worker entry
  //     from its package root via runtime-resolved file URLs, and the
  //     resolver in `lib/pdfjs/resource-paths.ts` probes for
  //     `pdfjs-dist/package.json` to locate that root.
  // Without explicit includes these files are pruned in production builds
  // (Vercel and local `pnpm start`), so the live graphical preview works in
  // dev but fails in prod. Cover both the base `/api/impose` route and any
  // nested route, and list both pnpm layouts so the includes apply whether
  // pdfjs-dist is hoisted to the repo root or to apps/admin.
  outputFileTracingIncludes: {
    "/*": serverAiRuntimeTracingFiles,
    "/api/ai/**/*": aiGoogleVertexTracingFiles,
    "/api/agents/**/*": aiGoogleVertexTracingFiles,
    "/api/chat": aiGoogleVertexTracingFiles,
    "/.well-known/workflow/**/*": fakturowniaReportFontFiles,
    "/api/fakturownia/reports/**/*": fakturowniaReportFontFiles,
    "/api/impose": [
      ...wasmRuntimeTracingFiles,
      "node_modules/pdfjs-dist/package.json",
      "node_modules/pdfjs-dist/cmaps/**",
      "node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/package.json",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/cmaps/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "apps/admin/node_modules/pdfjs-dist/package.json",
      "apps/admin/node_modules/pdfjs-dist/cmaps/**",
      "apps/admin/node_modules/pdfjs-dist/standard_fonts/**",
      "apps/admin/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/api/impose/**/*": [
      ...wasmRuntimeTracingFiles,
      "node_modules/pdfjs-dist/package.json",
      "node_modules/pdfjs-dist/cmaps/**",
      "node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/package.json",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/cmaps/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "apps/admin/node_modules/pdfjs-dist/package.json",
      "apps/admin/node_modules/pdfjs-dist/cmaps/**",
      "apps/admin/node_modules/pdfjs-dist/standard_fonts/**",
      "apps/admin/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  outputFileTracingExcludes: {
    "/*": serverlessTracingExcludes,
  },
  experimental: {
    optimizePackageImports: [
      "@konfi/components",
      "@konfi/google",
      "@konfi/payments",
      "@konfi/types",
      "@konfi/utils",
      "@chakra-ui/react",
      "react-hook-form",
      "firebase",
    ],
    turbopackInputSourceMaps: false,
    turbopackFileSystemCacheForDev: true,
    viewTransition: false,
    turbopackRustReactCompiler: true,
  },
  devIndicators: {
    position: "bottom-right",
  },
  allowedDevOrigins: ["127.0.0.1"],
};

const sentryConfig = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_ADMIN,

  // An auth token is required for uploading source maps.
  authToken: process.env.SENTRY_AUTH_TOKEN_ADMIN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Disable uploading source maps if no auth token is provided (CI builds without secrets)
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN_ADMIN,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js proxy, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  webpack: {
    treeshake: {
      removeDebugLogging: false,
      removeTracing: false,
      excludeReplayIframe: true,
      excludeReplayShadowDOM: true,
      excludeReplayCompressionWorker: true,
    },
  },
};

export default withWorkflow(withSentryConfig(nextConfig, sentryConfig));
