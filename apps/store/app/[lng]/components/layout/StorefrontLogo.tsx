"use client";

import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { getRuntimeStoreDisplayName } from "@/lib/runtime-config";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import { Box, Text } from "@chakra-ui/react";
import { Logo } from "@konfi/components";

export function StorefrontLogo({ src }: { src?: string }) {
  const runtimeConfig = useStoreRuntimeConfig();

  if (src) {
    return <Logo src={src} />;
  }

  if (!isSharedSaasTenantRuntime(runtimeConfig.tenantContext)) {
    return <Logo />;
  }

  const label = getRuntimeStoreDisplayName(runtimeConfig);

  return (
    <Box
      alignItems="center"
      aria-label={label}
      display="flex"
      h="10"
      maxW="full"
      minW={0}
      title={label}
      w="full"
    >
      <Text
        as="span"
        color="fg"
        fontSize="sm"
        fontWeight="semibold"
        letterSpacing="0"
        lineHeight="1.1"
        maxW="full"
        truncate
      >
        {label}
      </Text>
    </Box>
  );
}
