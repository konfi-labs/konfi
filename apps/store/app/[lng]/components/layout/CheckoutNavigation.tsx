import { Box, Flex, Text } from "@chakra-ui/react";
import { LinkOverlay } from "@konfi/components";
import { StorefrontLogo } from "./StorefrontLogo";

export default function CheckoutNavigation({
  checkoutLabel,
  lng,
  logoUrl,
}: {
  checkoutLabel: string;
  lng: string;
  logoUrl?: string;
}) {
  return (
    <Box as={"header"} position={"fixed"} w={"100%"} zIndex={"200"}>
      <Flex
        mt={"4"}
        pt={"0"}
        px={"6"}
        pb={"0"}
        minH={"80px"}
        align={"center"}
        justify={"center"}
        maxW={"1296px"}
        mx={"auto"}
        backgroundColor={{ base: "whiteAlpha.300", _dark: "blackAlpha.300" }}
        borderRadius={"full"}
        border={"1px solid"}
        borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
        justifyContent={"space-between"}
        _before={{
          content: "''",
          position: "absolute",
          width: "100%",
          height: "100%",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          mt: 4,
          backdropFilter: "saturate(125%) blur(10px)",
          zIndex: -1,
          borderRadius: "full",
          h: "80px",
          maxW: "1296px",
        }}
      >
        <Box
          display={"flex"}
          alignItems={"center"}
          mx={"2"}
          w={"100%"}
          height={"auto"}
          justifyContent={"space-between"}
        >
          <LinkOverlay lng={lng} href={"/"}>
            <Box ml={"2"} w={"80px"} height={"auto"}>
              <StorefrontLogo src={logoUrl} />
            </Box>
          </LinkOverlay>
          <Text fontWeight={"600"} color={"gray.500"}>
            {checkoutLabel}
          </Text>
        </Box>
      </Flex>
    </Box>
  );
}
