/* eslint-disable */
// @ts-check
import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import workflowNext from "workflow/next";

const { withWorkflow } = workflowNext;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(__dirname, "..", "..");
const wasmRuntimeTracingFiles = [
  "../../packages/wasm/dist/wasm_bg.wasm",
  "../../packages/wasm/dist/wasm.js",
];
const pdfRasterRuntimeTracingFiles = [
  "node_modules/@napi-rs/canvas/**",
  "node_modules/@napi-rs/canvas-linux-x64-gnu/**",
  "node_modules/@napi-rs/canvas-linux-x64-musl/**",
  "node_modules/@napi-rs/canvas-linux-arm64-gnu/**",
  "node_modules/@napi-rs/canvas-linux-arm64-musl/**",
  "../../node_modules/.pnpm/@napi-rs+canvas@*/node_modules/@napi-rs/canvas/**",
  "../../node_modules/.pnpm/@napi-rs+canvas-linux-x64-gnu@*/node_modules/@napi-rs/canvas-linux-x64-gnu/**",
  "../../node_modules/.pnpm/@napi-rs+canvas-linux-x64-musl@*/node_modules/@napi-rs/canvas-linux-x64-musl/**",
  "../../node_modules/.pnpm/@napi-rs+canvas-linux-arm64-gnu@*/node_modules/@napi-rs/canvas-linux-arm64-gnu/**",
  "../../node_modules/.pnpm/@napi-rs+canvas-linux-arm64-musl@*/node_modules/@napi-rs/canvas-linux-arm64-musl/**",
];

const firebaseHostedAuthDomainSuffixes = [".firebaseapp.com", ".web.app"];

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

/** @type {import('next').NextConfig} */

const nextConfig = {
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  reactStrictMode: true,
  serverExternalPackages: [
    "@napi-rs/canvas",
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
    "@konfi/preview3d",
    "@konfi/payments",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: process.env.NEXT_PUBLIC_CDN_URL || "placeholder.cdn.com",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "**",
      },
    ],
  },
  async rewrites() {
    return {
      beforeFiles: getFirebaseAuthHelperRewrites(),
    };
  },
  reactCompiler: true,
  typedRoutes: true,
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    "/.well-known/workflow/**/*": [
      ...wasmRuntimeTracingFiles,
      ...pdfRasterRuntimeTracingFiles,
      "node_modules/pdfjs-dist/package.json",
      "node_modules/pdfjs-dist/cmaps/**",
      "node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/package.json",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/cmaps/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "apps/store/node_modules/pdfjs-dist/package.json",
      "apps/store/node_modules/pdfjs-dist/cmaps/**",
      "apps/store/node_modules/pdfjs-dist/standard_fonts/**",
      "apps/store/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/[lng]/cart": [
      ...wasmRuntimeTracingFiles,
      "node_modules/pdfjs-dist/package.json",
      "node_modules/pdfjs-dist/cmaps/**",
      "node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/package.json",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/cmaps/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "apps/store/node_modules/pdfjs-dist/package.json",
      "apps/store/node_modules/pdfjs-dist/cmaps/**",
      "apps/store/node_modules/pdfjs-dist/standard_fonts/**",
      "apps/store/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/[lng]/checkout": [
      ...wasmRuntimeTracingFiles,
      "node_modules/pdfjs-dist/package.json",
      "node_modules/pdfjs-dist/cmaps/**",
      "node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/package.json",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/cmaps/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "apps/store/node_modules/pdfjs-dist/package.json",
      "apps/store/node_modules/pdfjs-dist/cmaps/**",
      "apps/store/node_modules/pdfjs-dist/standard_fonts/**",
      "apps/store/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/[lng]/products/[id]": [
      ...wasmRuntimeTracingFiles,
      "node_modules/pdfjs-dist/package.json",
      "node_modules/pdfjs-dist/cmaps/**",
      "node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/package.json",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/cmaps/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**",
      "node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "apps/store/node_modules/pdfjs-dist/package.json",
      "apps/store/node_modules/pdfjs-dist/cmaps/**",
      "apps/store/node_modules/pdfjs-dist/standard_fonts/**",
      "apps/store/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
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
  cacheLife: {
    blog: {
      stale: 3600, // 1 hour
      revalidate: 86400, // 1 day
      expire: 604800, // 1 week
    },
    products: {
      stale: 7200, // 2 hours
      revalidate: 86400, // 1 day
      expire: 604800, // 1 week
    },
  },
  devIndicators: {
    position: "bottom-right",
  },
  allowedDevOrigins: [
    "127.0.0.1",
    "*.store.localhost",
    "*.store.lvh.me",
  ],
};

const sentryConfig = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_STORE,

  // An auth token is required for uploading source maps.
  authToken: process.env.SENTRY_AUTH_TOKEN_STORE,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Disable uploading source maps if no auth token is provided (CI builds without secrets)
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN_STORE,

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
