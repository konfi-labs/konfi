import { Box, Center, Heading, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useT } from "@/i18n/client";

const Processing = () => {
  const { t } = useT();
  return (
    <Center
      h={"50vh"}
      justifyContent={"center"}
      textAlign={"center"}
      flexDirection={"column"}
      gap={4}
    >
      <Box position={"relative"}>
        <Box mb={4} borderRadius={"full"} py={8} boxShadow={"inner"}>
          <MaterialSymbol
            style={{
              fontSize: "140px",
              opacity: 0.1,
            }}
          >
            pending
          </MaterialSymbol>
        </Box>
        <Heading>
          {t("store.checkout.processing", { defaultValue: "Processing..." })}
        </Heading>
        <Text>
          {t("store.checkout.orderProcessing", {
            defaultValue: "Your order is being processed.",
          })}
        </Text>
      </Box>
    </Center>
  );
};

export default Processing;
