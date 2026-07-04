"use client";

import { download, list } from "@/lib/firebase/storage";
import { Box, Button, Flex, IconButton, Spacer, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { i18n as I18nInstance, TFunction } from "i18next";
import { useCallback, useEffect, useState } from "react";

type ReportItem = {
  name: string;
  fullPath: string;
};

type PaginatedReportListProps = {
  /** Storage path to list reports from (e.g., "reports/fakturownia-turnover") */
  storagePath: string;
  /** Translation key prefix for i18n (e.g., "fakturownia.reports.turnover") */
  translationPrefix: string;
  /** Number of days per page */
  pageDays?: number;
  /** i18n instance for formatting */
  i18n: I18nInstance;
  /** Translation function */
  t: TFunction;
  /** Callback when reports are loaded (optional, for parent state sync) */
  onReportsLoaded?: (reports: ReportItem[]) => void;
};

const DEFAULT_PAGE_DAYS = 7;

/**
 * Parses date from report filename.
 * Expects ISO date format (YYYY-MM-DD) in the filename.
 * Returns the last match if multiple dates are found.
 */
const parseReportDate = (fileName: string): Date | null => {
  const matches = Array.from(fileName.matchAll(/\d{4}-\d{2}-\d{2}/g)).map(
    (match) => match[0],
  );
  const isoCandidate = matches[matches.length - 1];
  if (!isoCandidate) {
    return null;
  }
  const parsed = new Date(`${isoCandidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

/**
 * Checks if a report's date falls within the specified date range.
 */
const isWithinDateRange = (
  fileName: string,
  rangeEndDate: Date,
  rangeDays: number,
): boolean => {
  const reportDate = parseReportDate(fileName);
  if (!reportDate) {
    return false;
  }

  const endDateUtc = new Date(
    Date.UTC(
      rangeEndDate.getFullYear(),
      rangeEndDate.getMonth(),
      rangeEndDate.getDate(),
    ),
  );
  const startDateUtc = new Date(
    Date.UTC(
      rangeEndDate.getFullYear(),
      rangeEndDate.getMonth(),
      rangeEndDate.getDate() - rangeDays + 1,
    ),
  );
  const normalizedReportDate = new Date(
    Date.UTC(
      reportDate.getUTCFullYear(),
      reportDate.getUTCMonth(),
      reportDate.getUTCDate(),
    ),
  );

  return (
    normalizedReportDate >= startDateUtc && normalizedReportDate <= endDateUtc
  );
};

/**
 * Checks if a report's date is before the specified date range.
 */
const isBeforeDateRange = (
  fileName: string,
  rangeEndDate: Date,
  rangeDays: number,
): boolean => {
  const reportDate = parseReportDate(fileName);
  if (!reportDate) {
    return false;
  }

  const startDateUtc = new Date(
    Date.UTC(
      rangeEndDate.getFullYear(),
      rangeEndDate.getMonth(),
      rangeEndDate.getDate() - rangeDays + 1,
    ),
  );
  const normalizedReportDate = new Date(
    Date.UTC(
      reportDate.getUTCFullYear(),
      reportDate.getUTCMonth(),
      reportDate.getUTCDate(),
    ),
  );

  return normalizedReportDate < startDateUtc;
};

/**
 * Checks if a report's date is after the specified date range.
 */
const isAfterDateRange = (fileName: string, rangeEndDate: Date): boolean => {
  const reportDate = parseReportDate(fileName);
  if (!reportDate) {
    return false;
  }

  const endDateUtc = new Date(
    Date.UTC(
      rangeEndDate.getFullYear(),
      rangeEndDate.getMonth(),
      rangeEndDate.getDate(),
    ),
  );
  const normalizedReportDate = new Date(
    Date.UTC(
      reportDate.getUTCFullYear(),
      reportDate.getUTCMonth(),
      reportDate.getUTCDate(),
    ),
  );

  return normalizedReportDate > endDateUtc;
};

/**
 * A reusable component for displaying paginated report lists with date-based navigation.
 *
 * This component handles:
 * - Fetching reports from Firebase Storage
 * - Date-based pagination (navigating through date ranges)
 * - Loading and error states
 * - Downloading reports
 */
const PaginatedReportList = ({
  storagePath,
  translationPrefix,
  pageDays = DEFAULT_PAGE_DAYS,
  i18n,
  t,
  onReportsLoaded,
}: PaginatedReportListProps) => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageEndDate, setPageEndDate] = useState<Date>(() => new Date());
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

  const loadReports = useCallback(
    async (endDate: Date) => {
      setIsLoading(true);
      setError(null);

      try {
        const items = await list(storagePath);
        const allItems = (items ?? []).map((item) => ({
          name: item.name,
          fullPath: item.fullPath,
        }));

        const filtered = allItems.filter((item) =>
          isWithinDateRange(item.name, endDate, pageDays),
        );
        filtered.sort((first, second) => second.name.localeCompare(first.name));

        const hasOlderReports = allItems.some((item) =>
          isBeforeDateRange(item.name, endDate, pageDays),
        );
        const hasNewerReports = allItems.some((item) =>
          isAfterDateRange(item.name, endDate),
        );

        setReports(filtered);
        setHasNextPage(hasOlderReports);
        setHasPrevPage(hasNewerReports);
        setPageEndDate(endDate);
        onReportsLoaded?.(filtered);
      } catch (err) {
        console.error(
          `PaginatedReportList: failed to list reports from ${storagePath}`,
          err,
        );
        setError(
          t(`${translationPrefix}.generatedReports.listError`, {
            defaultValue: "Failed to load generated reports",
          }),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [storagePath, pageDays, t, translationPrefix, onReportsLoaded],
  );

  const handlePrevPage = useCallback(() => {
    const newEndDate = new Date(pageEndDate);
    newEndDate.setDate(newEndDate.getDate() + pageDays);
    void loadReports(newEndDate);
  }, [pageEndDate, loadReports, pageDays]);

  const handleNextPage = useCallback(() => {
    const newEndDate = new Date(pageEndDate);
    newEndDate.setDate(newEndDate.getDate() - pageDays);
    void loadReports(newEndDate);
  }, [pageEndDate, loadReports, pageDays]);

  useEffect(() => {
    void loadReports(new Date());
  }, [loadReports]);

  const handleDownload = useCallback(async (fullPath: string) => {
    try {
      await download(fullPath, true);
    } catch (err) {
      console.error(
        `PaginatedReportList: failed to open report from ${fullPath}`,
        err,
      );
    }
  }, []);

  const locale = i18n.resolvedLanguage ?? i18n.language ?? "pl-PL";
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "short" });

  const startDate = new Date(pageEndDate);
  startDate.setDate(startDate.getDate() - pageDays + 1);
  const dateRangeLabel = `${dateFormatter.format(startDate)} - ${dateFormatter.format(pageEndDate)}`;

  return (
    <Box>
      <Flex mb="2" alignItems="center" gap="2">
        <Box fontWeight="medium">
          {t(`${translationPrefix}.generatedReports.title`, {
            defaultValue: "Generated reports",
          })}
        </Box>
        <Spacer />
        <Flex alignItems="center" gap="1">
          <IconButton
            size="xs"
            variant="ghost"
            aria-label={t(`${translationPrefix}.generatedReports.previous`, {
              defaultValue: "Previous",
            })}
            onClick={handlePrevPage}
            disabled={!hasPrevPage || isLoading}
          >
            <MaterialSymbol>chevron_left</MaterialSymbol>
          </IconButton>
          <Text fontSize="xs" color="fg.muted" minW="120px" textAlign="center">
            {dateRangeLabel}
          </Text>
          <IconButton
            size="xs"
            variant="ghost"
            aria-label={t(`${translationPrefix}.generatedReports.next`, {
              defaultValue: "Next",
            })}
            onClick={handleNextPage}
            disabled={!hasNextPage || isLoading}
          >
            <MaterialSymbol>chevron_right</MaterialSymbol>
          </IconButton>
        </Flex>
      </Flex>
      {error && (
        <Box fontSize="sm" color="red.500" mb="2">
          {error}
        </Box>
      )}
      {isLoading ? (
        <Box fontSize="sm">
          {t(`${translationPrefix}.generatedReports.loading`, {
            defaultValue: "Loading reports…",
          })}
        </Box>
      ) : reports.length === 0 ? (
        <Box fontSize="sm">
          {t(`${translationPrefix}.generatedReports.emptyRange`, {
            defaultValue: "No generated reports found in this date range.",
          })}
        </Box>
      ) : (
        <Box as="ul" fontSize="sm" pl="4">
          {reports.map((report) => (
            <Box
              as="li"
              key={report.fullPath}
              mb="1"
              display="flex"
              alignItems="center"
              gap="2"
              _hover={{ bg: "gray.subtle" }}
              borderRadius="full"
              px={4}
            >
              <Box flex="1">{report.name}</Box>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void handleDownload(report.fullPath)}
              >
                {t("fakturownia.documents.actions.view", {
                  defaultValue: "View",
                })}
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default PaginatedReportList;
