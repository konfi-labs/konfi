"use client";

import type { AdminAuthErrorReason } from "@/lib/auth-errors";
import { Center, Flex, GridItem, SimpleGrid, Skeleton } from "@chakra-ui/react";
import { LinkOverlay, Logo } from "@konfi/components";
import dynamic from "next/dynamic";
import { useT } from "@/i18n/client";
const LoginForm = dynamic(() => import("@/components/auth/LoginForm"), {
  loading: () => <Skeleton />,
  ssr: false,
});

const LoginPage = ({ authError }: { authError?: AdminAuthErrorReason; }) => {
  const { i18n } = useT();

  return (
    <SimpleGrid
      columns={[1, 1, 2, 2]}
      gap={0}
      position={"absolute"}
      left={0}
      top={-4}
      w={"100vw"}
      h={"100vh"}
    >
      <GridItem h={"100%"} bgImage={`url(/assets/bg.png)`} bgRepeat={"round"}>
        <Flex
          h={"93%"}
          mx={8}
          my={8}
          flexDir={"column"}
          justify={"space-between"}
          width={"100px"}
          filter={"invert(1)"}
        >
          <LinkOverlay lng={i18n.resolvedLanguage} href={"/"} mr={"auto"}>
            <Logo />
          </LinkOverlay>
        </Flex>
      </GridItem>
      <GridItem alignContent={"center"} w={"auto"}>
        <Center m={8}>
          <LoginForm authError={authError} />
        </Center>
      </GridItem>
    </SimpleGrid>
  );
};

export default LoginPage;
