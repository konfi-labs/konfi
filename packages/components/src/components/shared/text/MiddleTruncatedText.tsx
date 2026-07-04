import { Text, chakra } from "@chakra-ui/react";
import * as React from "react";

export const DEFAULT_MIDDLE_TRUNCATED_TAIL_CHARS = 12;

export function getMiddleTruncatedTextParts(
  value: string,
  trailingChars: number = DEFAULT_MIDDLE_TRUNCATED_TAIL_CHARS,
) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return { leading: "", trailing: "" };
  }

  if (trailingChars <= 0 || normalizedValue.length <= trailingChars * 2) {
    return { leading: normalizedValue, trailing: "" };
  }

  return {
    leading: normalizedValue.slice(0, -trailingChars),
    trailing: normalizedValue.slice(-trailingChars),
  };
}

interface MiddleTruncatedTextProps extends React.ComponentPropsWithoutRef<
  typeof chakra.span
> {
  value: string;
  trailingChars?: number;
}

export function MiddleTruncatedText({
  value,
  trailingChars = DEFAULT_MIDDLE_TRUNCATED_TAIL_CHARS,
  ...rest
}: MiddleTruncatedTextProps) {
  const { leading, trailing } = getMiddleTruncatedTextParts(
    value,
    trailingChars,
  );

  return (
    <chakra.span
      display="inline-flex"
      alignItems="center"
      minW={0}
      maxW="100%"
      whiteSpace="nowrap"
      {...rest}
    >
      <Text as="span" flex="1" minW={0} truncate>
        {leading}
      </Text>
      {trailing ? (
        <Text as="span" flexShrink={0}>
          {trailing}
        </Text>
      ) : null}
    </chakra.span>
  );
}
