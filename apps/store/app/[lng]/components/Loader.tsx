import { Center, Spinner, Text } from "@chakra-ui/react";

const Loader = ({ text }: { text: string }) => {
  return (
    <Center h="calc(100vh - 66px)">
      <Spinner color="primary.solid" />
      <Text ml={4}>{text}</Text>
    </Center>
  );
};

export default Loader;
