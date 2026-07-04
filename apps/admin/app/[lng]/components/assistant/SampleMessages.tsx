"use client";

import { useT } from "@/i18n/client";
import { Card, Flex, Grid, Heading, Skeleton, Text } from "@chakra-ui/react";

interface SampleMessagesProps {
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onSetInputValue: (value: string) => void;
}

export function SampleMessages({
  isLoading,
  onSendMessage,
  onSetInputValue,
}: SampleMessagesProps) {
  const { t } = useT();

  return (
    <Grid
      templateColumns={{ base: "repeat(1, 1fr)", md: "repeat(2, 1fr)" }}
      gap={"2"}
      w={"100%"}
    >
      <Skeleton loading={isLoading}>
        <Card.Root
          h={"100%"}
          size={"sm"}
          rounded={"3xl"}
          _hover={{ bgColor: { base: "gray.50", _dark: "black" } }}
          userSelect={"none"}
          onClick={() =>
            onSendMessage(
              t("assistant.summarizeYesterday", {
                defaultValue:
                  "Create a brief summary of yesterday's orders, don't list all retrieved orders, just create a summary.",
              }),
            )
          }
        >
          <Card.Header>
            <Heading size={["sm", "md"]}>
              {t("assistant.summarizeYesterdayButton", {
                defaultValue: "Summarize yesterday's orders",
              })}
            </Heading>
          </Card.Header>
          <Card.Body color={"fg.muted"} fontSize={["xs", "sm"]}>
            <Flex minW={"100px"}>
              <Text lineClamp={"2"}>
                {t("assistant.summarizeYesterday", {
                  defaultValue:
                    "Create a brief summary of yesterday's orders, don't list all retrieved orders, just create a summary.",
                }).slice(0, 150)}
                ...
              </Text>
            </Flex>
          </Card.Body>
        </Card.Root>
      </Skeleton>
      <Skeleton loading={isLoading}>
        <Card.Root
          h={"100%"}
          size={"sm"}
          rounded={"3xl"}
          _hover={{ bgColor: { base: "gray.50", _dark: "black" } }}
          userSelect={"none"}
          onClick={() =>
            onSendMessage(
              t("assistant.summarizeLastWeek", {
                defaultValue:
                  "Create a brief summary of last week's orders, don't list all retrieved orders, just create a summary.",
              }),
            )
          }
        >
          <Card.Header>
            <Heading size={["sm", "md"]}>
              {t("assistant.summarizeLastWeekButton", {
                defaultValue: "Summarize last week's orders",
              })}
            </Heading>
          </Card.Header>
          <Card.Body color={"fg.muted"} fontSize={["xs", "sm"]}>
            <Flex minW={"100px"}>
              <Text lineClamp={"2"}>
                {t("assistant.summarizeLastWeek", {
                  defaultValue:
                    "Create a brief summary of last week's orders, don't list all retrieved orders, just create a summary.",
                }).slice(0, 150)}
                ...
              </Text>
            </Flex>
          </Card.Body>
        </Card.Root>
      </Skeleton>
      <Skeleton loading={isLoading}>
        <Card.Root
          h={"100%"}
          size={"sm"}
          rounded={"3xl"}
          _hover={{ bgColor: { base: "gray.50", _dark: "black" } }}
          userSelect={"none"}
          onClick={() =>
            onSetInputValue(
              t("assistant.answerEmail", {
                defaultValue: "Answer email: `Provide the email context here`",
              }),
            )
          }
        >
          <Card.Header>
            <Heading size={["sm", "md"]}>
              {t("assistant.answerEmailButton", {
                defaultValue: "Answer email",
              })}
            </Heading>
          </Card.Header>
          <Card.Body color={"fg.muted"} fontSize={["xs", "sm"]}>
            <Flex minW={"100px"}>
              <Text lineClamp={"2"}>
                {t("assistant.answerEmail", {
                  defaultValue:
                    "Answer email: `Provide the email context here`",
                }).slice(0, 150)}
                ...
              </Text>
            </Flex>
          </Card.Body>
        </Card.Root>
      </Skeleton>
      <Skeleton loading={isLoading}>
        <Card.Root
          h={"100%"}
          size={"sm"}
          rounded={"3xl"}
          _hover={{ bgColor: { base: "gray.50", _dark: "black" } }}
          userSelect={"none"}
          onClick={() =>
            onSetInputValue(
              t("assistant.createProductAgent", {
                defaultValue:
                  "Start the Product creation agent. Create product: [paste product name, description, full gross/net price table, attributes, options, and notes here]",
              }),
            )
          }
        >
          <Card.Header>
            <Heading size={["sm", "md"]}>
              {t("assistant.createProductAgentButton", {
                defaultValue: "Create product agent",
              })}
            </Heading>
          </Card.Header>
          <Card.Body color={"fg.muted"} fontSize={["xs", "sm"]}>
            <Flex minW={"100px"}>
              <Text lineClamp={"2"}>
                {t("assistant.createProductAgent", {
                  defaultValue:
                    "Start the Product creation agent. Create product: [paste product name, description, full gross/net price table, attributes, options, and notes here]",
                }).slice(0, 150)}
                ...
              </Text>
            </Flex>
          </Card.Body>
        </Card.Root>
      </Skeleton>
    </Grid>
  );
}
