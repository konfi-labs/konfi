"use client";

import { Center, Heading, Stack, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";

export function MaintenancePageContent({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <Center minH="70vh" px={4}>
      <Stack align="center" gap={5} maxW="lg" textAlign="center">
        <Center
          aria-hidden="true"
          bg="bg.subtle"
          borderRadius="full"
          boxSize={16}
          color="fg.muted"
        >
          <MaterialSymbol fontSize="32px">construction</MaterialSymbol>
        </Center>
        <Stack gap={3}>
          <Heading as="h1" size="2xl">
            {title}
          </Heading>
          <Text color="fg.muted" fontSize="lg">
            {message}
          </Text>
        </Stack>
      </Stack>
    </Center>
  );
}
