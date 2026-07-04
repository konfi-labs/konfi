import { Box, Button, Center, Heading, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useT } from "@/i18n/client";

const Error = ({
  error,
  setError,
}: {
  error: string;
  setError: React.Dispatch<React.SetStateAction<string>>;
}) => {
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
            error
          </MaterialSymbol>
        </Box>
        <Heading>
          {t("store.checkout.error", { defaultValue: "Error!" })}
        </Heading>
        <Text>{t(`ERROR.${error}`)}</Text>
      </Box>
      <Button onClick={() => setError("")}>
        {t("common.tryAgain", { defaultValue: "Try Again" })}
      </Button>
    </Center>
  );
};

export default Error;
