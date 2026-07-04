"use client";

import { Badge, Box, Flex, Heading, HStack, Text } from "@chakra-ui/react";
import { PreflightIssue } from "@konfi/types";
import { groupBy } from "es-toolkit";
import { useMemo } from "react";

export function PreflightIssues({
  issues,
  t,
}: {
  issues: PreflightIssue[];
  t: (key: string) => string;
}) {
  const cleanedUpIssues: {
    rule: string;
    count: number;
  }[] = useMemo(() => {
    const result = groupBy(issues, (issue) => issue.rule);
    const _cleanedUpIssues = Object.keys(result).map((key) => ({
      rule: key,
      count: result[key].length,
    }));

    return _cleanedUpIssues;
  }, [issues]);

  return cleanedUpIssues.length > 0 ? (
    <Box
      mt={"4"}
      border={"2px solid"}
      borderColor={"gray.50"}
      borderRadius={"3xl"}
      p={8}
    >
      <Heading fontSize={"xl"} mb={2} color={"text"}>
        Rezultat Weryfikacji Plików
      </Heading>
      <Text></Text>
      <HStack wrap={"wrap"} gap={2}>
        {cleanedUpIssues.map((issue, index) => (
          <Flex key={index} align={"flex-start"}>
            <Badge>
              ({issue.count}){" "}
              {t(`PreflightRules.${issue.rule.replaceAll("::", "")}`)}
            </Badge>
          </Flex>
        ))}
      </HStack>
      <Text mt={4} fontWeight={"bold"} fontSize={"md"}>
        {" "}
        Możesz kontynuować zakup pomimo wykrytych problemów z plikami.
      </Text>
    </Box>
  ) : null;
}
