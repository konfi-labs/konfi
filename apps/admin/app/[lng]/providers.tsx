"use client";

import { AuthProvider } from "@/context/auth";
import { ChannelsProvider } from "@/context/channels";
import { ChatDrawerProvider } from "@/context/chat-drawer";
import { ConfigurationProvider } from "@/context/configuration";
import { NotificationsProvider } from "@/context/notifications";
import { TenantProvider } from "@/context/tenant";
import { FeaturePreviewProvider } from "@/context/featurePreview";
import { WhatsNewProvider } from "@/context/whatsNew";
import { useElectronDarkMode } from "@/hooks/useElectronDarkMode";
import { AppProgressProvider as ProgressProvider } from "@bprogress/next";
import { ChakraProvider } from "@chakra-ui/react";
import { InpostGeowidgetTokenProvider } from "@konfi/components/shared/InpostGeowidget";
import { ColorModeProvider } from "@konfi/components/ui/color-mode";
import { Toaster } from "@konfi/components/ui/toaster";
import { swrConfig } from "@konfi/utils/constants";
import { ADMIN_ORDERS_CREATE, ADMIN_QUOTES_CREATE } from "@konfi/utils/routes";
import type { TenantContext } from "@konfi/types";
import { NotesProvider } from "context/notes";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { SWRConfig } from "swr";
import { system } from "../../theme";
import { AdminServiceWorkerRegistration } from "./components/pwa/AdminServiceWorkerRegistration";

const ChatButton = dynamic(() => import("@/components/layout/ChatButton"), {
  ssr: false,
});
const TeamChatDisplay = dynamic(
  () => import("@/components/team-chat").then((m) => m.TeamChatDisplay),
  { ssr: false },
);
const FeaturePreviewDialog = dynamic(
  () =>
    import("@/components/featurePreview/FeaturePreviewDialog").then(
      (m) => m.FeaturePreviewDialog,
    ),
  { ssr: false },
);

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN: string;
    darkMode?: {
      toggle: () => Promise<boolean>;
      get: () => Promise<boolean>;
      onChange: (callback: (isDark: boolean) => void) => () => void;
    };
  }
}

// oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
const isDevelopment = process.env.NODE_ENV === "development";

if (
  typeof window !== "undefined" &&
  typeof self !== "undefined" &&
  (isDevelopment || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true")
) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN =
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ADMIN ?? "";
}

function ElectronDarkModeSync() {
  useElectronDarkMode();
  return null;
}

export function Providers({
  children,
  inpostGeowidgetToken,
  swrFallback,
  tenantContext,
}: {
  children: React.ReactNode;
  inpostGeowidgetToken?: string;
  swrFallback?: Record<string, unknown>;
  tenantContext: TenantContext;
}) {
  const router = useRouter();
  useHotkeys("alt+1", () => router.push(ADMIN_ORDERS_CREATE));
  useHotkeys("alt+2", () => router.push(ADMIN_QUOTES_CREATE));
  useHotkeys("alt+3", () => router.push("/customers?type=create-new"));

  return (
    <ProgressProvider
      color={process.env.NEXT_PUBLIC_COMPANY_MAIN_COLOR ?? "#06f"}
      height={"4px"}
      options={{ showSpinner: false }}
      shallowRouting
    >
      <ChakraProvider value={system}>
        <ColorModeProvider>
          <ElectronDarkModeSync />
          <AdminServiceWorkerRegistration />
          <Toaster />
          <SWRConfig value={{ ...swrConfig, fallback: swrFallback }}>
            <TenantProvider tenantContext={tenantContext}>
              <InpostGeowidgetTokenProvider token={inpostGeowidgetToken}>
                <AuthProvider>
                  <FeaturePreviewProvider>
                    <WhatsNewProvider>
                      <ChatDrawerProvider>
                        <ChatButton />
                        <ChannelsProvider>
                          <NotificationsProvider>
                            <NotesProvider>
                              <ConfigurationProvider>
                                <TeamChatDisplay />
                                {children}
                              </ConfigurationProvider>
                            </NotesProvider>
                          </NotificationsProvider>
                        </ChannelsProvider>
                      </ChatDrawerProvider>
                    </WhatsNewProvider>
                    <FeaturePreviewDialog />
                  </FeaturePreviewProvider>
                </AuthProvider>
              </InpostGeowidgetTokenProvider>
            </TenantProvider>
          </SWRConfig>
        </ColorModeProvider>
      </ChakraProvider>
    </ProgressProvider>
  );
}
