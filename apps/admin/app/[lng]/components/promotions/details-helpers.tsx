import {
  Box,
  Grid,
  type GridProps,
  HStack,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { CurrencyEnum } from "@konfi/types";
import type { ReactNode } from "react";

type DetailsCardProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

type DetailsFieldProps = {
  label: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
};

export function DetailsCard({
  title,
  description,
  action,
  children,
}: DetailsCardProps) {
  return (
    <Box border="1px solid" borderColor="gray.muted" borderRadius="3xl" p="8">
      <VStack align="stretch" gap={4}>
        <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
          <Box>
            <Text as="h2" fontSize="lg" fontWeight="bold">
              {title}
            </Text>
            {description ? (
              <Text mt={1} color="fg.muted">
                {description}
              </Text>
            ) : null}
          </Box>
          {action}
        </HStack>
        <Separator />
        {children}
      </VStack>
    </Box>
  );
}

export function DetailsGrid(props: GridProps) {
  return (
    <Grid
      templateColumns={["repeat(1, 1fr)", "repeat(2, minmax(0, 1fr))"]}
      gap={4}
      {...props}
    />
  );
}

export function DetailsField({ label, value, children }: DetailsFieldProps) {
  return (
    <Box>
      <Text fontSize="sm" color="fg.muted">
        {label}
      </Text>
      <Box mt={1}>
        {children ?? <Text fontWeight="medium">{value}</Text>}
      </Box>
    </Box>
  );
}

export function formatDateValue(
  value?: string | null,
  locale?: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(locale, options);
}

export function formatDateTimeValue(
  value?: string | null,
  locale?: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(locale, options);
}

export function formatMinorCurrency(
  value?: number | null,
  currencyCode?: CurrencyEnum | string | null,
  locale?: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const amount = value / 100;

  if (!currencyCode) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

export function formatNumberValue(
  value?: number | null,
  locale?: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return new Intl.NumberFormat(locale).format(value);
}
