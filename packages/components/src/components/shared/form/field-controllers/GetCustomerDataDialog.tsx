"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  HStack,
  Presence,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import { AddressTypeEnum } from "@konfi/types";
import { DONE_TYPING_INTERVAL } from "@konfi/utils";
import { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { FieldValues, useFormContext, useWatch } from "react-hook-form";
import {
  getCustomerDataCompanyName,
  type CustomerDataMatch,
  type CustomerDataLookupResponse,
  type CustomerDataSource,
  type CustomerDataSubject,
  type FakturowniaCustomerDescriptionLookupResponse,
  getCustomerDataTarget,
  mergeCustomerDescriptions,
  normalizeNip,
  parsePolishAddress,
  type WLResponse,
} from "./GetCustomerDataDialog.helpers";

const NIP_DIGITS_RE = /^\d{10}$/;
const ADDRESS_TYPES = new Set(Object.values(AddressTypeEnum));

type LookupNotice = {
  kind: "loading" | "success" | "warning" | "error";
  matches?: CustomerDataMatch[];
  nip: string;
  source?: CustomerDataSource;
  title: string;
  description: string;
  subject?: CustomerDataSubject;
};

function CustomerDataMatchesDialog({
  matches,
  nip,
  onSelect,
  onOpenChange,
  open,
  t,
}: {
  matches: CustomerDataMatch[];
  nip: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (match: CustomerDataMatch) => void;
  open: boolean;
  t: TFunction;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open: nextOpen }) => onOpenChange(nextOpen)}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="lg">
            <Dialog.Header>
              <Dialog.Title>
                {t("forms.getCustomerDataDialog.dialogs.multipleClientsTitle", {
                  defaultValue: "Multiple Fakturownia clients found",
                })}
              </Dialog.Title>
              <Dialog.Description>
                {t(
                  "forms.getCustomerDataDialog.dialogs.multipleClientsDescription",
                  {
                    defaultValue:
                      "Select which existing Fakturownia client should be used for NIP {{nip}}.",
                    nip,
                  },
                )}
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap={2} maxH="50vh" overflowY="auto">
                {matches.map((match) => {
                  const companyName = getCustomerDataCompanyName(match.subject);
                  const address =
                    match.subject.workingAddress ??
                    match.subject.residenceAddress ??
                    undefined;

                  return (
                    <Card.Root key={match.id} variant="subtle">
                      <Card.Body>
                        <HStack align="center" justify="space-between" gap={3}>
                          <VStack align="start" gap={0} flex="1">
                            <Text fontWeight="medium">
                              {companyName ||
                                t(
                                  "forms.getCustomerDataDialog.labels.unnamedClient",
                                  {
                                    defaultValue: "Unnamed client",
                                  },
                                )}
                            </Text>
                            <Text
                              textStyle="sm"
                              color="fg.muted"
                              translate="no"
                            >
                              {t("forms.labels.taxId", {
                                defaultValue: "Tax ID",
                              })}
                              : {match.subject.nip ?? nip}
                            </Text>
                            {address ? (
                              <Text textStyle="sm" color="fg.muted">
                                {address}
                              </Text>
                            ) : null}
                            {match.email ? (
                              <Text textStyle="sm" color="fg.muted">
                                {match.email}
                              </Text>
                            ) : null}
                          </VStack>
                          <Button size="xs" onClick={() => onSelect(match)}>
                            {t("common.select", { defaultValue: "Select" })}
                          </Button>
                        </HStack>
                      </Card.Body>
                    </Card.Root>
                  );
                })}
                {matches.length === 0 ? (
                  <Text textStyle="sm">
                    {t("common.noResults", { defaultValue: "No results" })}
                  </Text>
                ) : null}
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

async function fetchCustomerDataFromAdminRoute(
  nip: string,
  signal: AbortSignal,
): Promise<CustomerDataLookupResponse | null> {
  const response = await fetch("/api/customer-data/nip", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ nip }),
    cache: "no-cache",
    signal,
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as CustomerDataLookupResponse;
}

async function fetchFakturowniaCustomerDescriptionsFromAdminRoute(
  nip: string,
  signal: AbortSignal,
): Promise<string[]> {
  const response = await fetch("/api/customer-data/nip/description", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ nip }),
    cache: "no-cache",
    signal,
  });

  if (!response.ok) {
    return [];
  }

  const body =
    (await response.json()) as FakturowniaCustomerDescriptionLookupResponse;

  return (
    body.descriptions?.filter(
      (description) =>
        typeof description === "string" && description.trim().length > 0,
    ) ?? []
  );
}

async function fetchCustomerDataFromWL(
  nip: string,
  signal: AbortSignal,
): Promise<CustomerDataLookupResponse> {
  const date = new Date().toISOString().slice(0, 10);
  const response = await fetch(
    `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`,
    { cache: "no-cache", signal },
  );

  if (!response.ok) {
    return {
      source: "wl",
      subject: null,
      errors: [`HTTP ${response.status}`],
    };
  }

  const body = (await response.json()) as WLResponse & {
    code?: string;
    message?: string;
  };

  if (body.code) {
    return {
      source: "wl",
      subject: null,
      errors: [body.message ?? body.code],
    };
  }

  return {
    source: "wl",
    subject: body.result.subject,
  };
}

async function fetchCustomerData(
  nip: string,
  signal: AbortSignal,
): Promise<CustomerDataLookupResponse> {
  try {
    const routeResponse = await fetchCustomerDataFromAdminRoute(nip, signal);
    if (routeResponse) {
      return routeResponse;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    console.error(
      "[GetCustomerDataDialog] Admin company data route failed",
      error,
    );
  }

  return fetchCustomerDataFromWL(nip, signal);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAddressType(value: unknown): value is AddressTypeEnum {
  return (
    typeof value === "string" && ADDRESS_TYPES.has(value as AddressTypeEnum)
  );
}

export const GetCustomerDataDialog = ({
  fieldName,
  lookupSequence = 0,
  prefilledFakturowniaCustomerDescription,
  t,
}: {
  fieldName: string;
  lookupSequence?: number;
  prefilledFakturowniaCustomerDescription?: string;
  t: TFunction;
}) => {
  const { control, getValues, setValue } = useFormContext<FieldValues>();
  const [notice, setNotice] = useState<LookupNotice | null>(null);
  const [renderedNotice, setRenderedNotice] = useState<LookupNotice | null>(
    null,
  );
  const [matchesDialogOpen, setMatchesDialogOpen] = useState(false);
  const [
    fetchedPrefilledFakturowniaCustomerDescriptions,
    setFetchedPrefilledFakturowniaCustomerDescriptions,
  ] = useState<string[]>([]);

  const watchedNip = useWatch({
    control,
    name: fieldName,
    disabled: !fieldName,
  });
  const normalizedNip =
    typeof watchedNip === "string" ? normalizeNip(watchedNip) : "";

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSeenNipRef = useRef<string>("");
  const lastRequestedNipRef = useRef<string | null>(null);
  const lastLookupSequenceRef = useRef<number>(lookupSequence);

  const cancelPending = useCallback(() => {
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelPending(), [cancelPending]);

  useEffect(() => {
    if (notice) {
      setRenderedNotice(notice);
    }
  }, [notice]);

  const applyFetchedData = useCallback(
    (subject: CustomerDataSubject, nip: string): boolean => {
      if (!fieldName) return false;

      const companyName = getCustomerDataCompanyName(subject);
      const formValues = getValues() as Record<string, unknown>;
      const target = getCustomerDataTarget(fieldName, formValues);

      if (target.entityNamePath) {
        setValue(target.entityNamePath, companyName, {
          shouldDirty: true,
          shouldTouch: true,
        });
      }

      if (target.companyNamePath) {
        setValue(target.companyNamePath, companyName, {
          shouldDirty: true,
          shouldTouch: true,
        });
      }

      if (target.regonPath && subject.regon) {
        setValue(target.regonPath, subject.regon, {
          shouldDirty: true,
          shouldTouch: true,
        });
      }

      if (target.krsPath && subject.krs) {
        setValue(target.krsPath, subject.krs, {
          shouldDirty: true,
          shouldTouch: true,
        });
      }

      const address = subject.workingAddress ?? subject.residenceAddress;
      if (
        !address ||
        (!target.addressPath && !target.invoiceRecipientAddressPath)
      ) {
        return false;
      }

      const { street, zip, city } = parsePolishAddress(address);
      if (!street) {
        return false;
      }

      if (target.invoiceRecipientAddressPath) {
        const currentRecipientAddressValue = getValues(
          target.invoiceRecipientAddressPath,
        );
        const currentRecipientAddress = isRecord(currentRecipientAddressValue)
          ? currentRecipientAddressValue
          : undefined;
        const currentRecipientNip =
          currentRecipientAddress?.invoiceRecipientNip;
        const currentRecipientRole =
          currentRecipientAddress?.invoiceRecipientRole;

        setValue(
          target.invoiceRecipientAddressPath,
          {
            ...(currentRecipientAddress ?? {}),
            invoiceRecipientEnabled: true,
            invoiceRecipientRole:
              typeof currentRecipientRole === "string" &&
              currentRecipientRole.trim().length > 0
                ? currentRecipientRole
                : "recipient",
            invoiceRecipientName: companyName,
            invoiceRecipientNip:
              typeof currentRecipientNip === "string" &&
              currentRecipientNip.trim().length > 0
                ? currentRecipientNip
                : (subject.nip ?? nip),
            invoiceRecipientStreet: street,
            invoiceRecipientZip: zip,
            invoiceRecipientCity: city,
          },
          {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          },
        );

        return true;
      }

      const addressPath = target.addressPath;
      if (!addressPath) {
        return false;
      }

      const currentAddressValue = getValues(addressPath);
      const currentAddress = isRecord(currentAddressValue)
        ? currentAddressValue
        : undefined;
      const currentCountry = currentAddress?.country;
      const currentActive = currentAddress?.active;
      const currentType = currentAddress?.type;
      const currentAddressNip = currentAddress?.nip;

      setValue(
        addressPath,
        {
          ...(currentAddress ?? {}),
          name: companyName,
          type: isAddressType(currentType)
            ? currentType
            : AddressTypeEnum.BILLING,
          nip:
            typeof currentAddressNip === "string" &&
            currentAddressNip.trim().length > 0
              ? currentAddressNip
              : (subject.nip ?? nip),
          companyName,
          street,
          zip,
          city,
          country:
            typeof currentCountry === "string" &&
            currentCountry.trim().length > 0
              ? currentCountry
              : t("ui.country.poland", { defaultValue: "Poland" }),
          active: typeof currentActive === "boolean" ? currentActive : true,
        },
        {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        },
      );

      return true;
    },
    [fieldName, getValues, setValue, t],
  );

  const setLoadedNotice = useCallback(
    ({
      nip,
      noticeMessage,
      source,
      subject,
    }: {
      nip: string;
      noticeMessage?: string;
      source: CustomerDataSource;
      subject: CustomerDataSubject;
    }) => {
      const addressLoaded = applyFetchedData(subject, nip);
      const descriptionKey = noticeMessage
        ? "forms.getCustomerDataDialog.alerts.providerNoticeDescription"
        : source === "fakturownia-client" && addressLoaded
          ? "forms.getCustomerDataDialog.alerts.loadedFromFakturowniaClientDescription"
          : addressLoaded
            ? "forms.getCustomerDataDialog.alerts.loadedDescription"
            : "forms.getCustomerDataDialog.alerts.partiallyLoadedDescription";
      const descriptionOptions = noticeMessage
        ? {
            defaultValue: "{{notice}}",
            notice: noticeMessage,
          }
        : source === "fakturownia-client" && addressLoaded
          ? {
              defaultValue:
                "Fields were filled automatically from an existing Fakturownia client.",
            }
          : {
              defaultValue: addressLoaded
                ? "Fields were filled automatically from the public registry."
                : "Company data was found, but the address could not be filled automatically.",
            };

      setNotice({
        kind: noticeMessage ? "warning" : addressLoaded ? "success" : "warning",
        nip,
        source,
        title: t(
          addressLoaded
            ? "forms.getCustomerDataDialog.alerts.loadedTitle"
            : "forms.getCustomerDataDialog.alerts.partiallyLoadedTitle",
          {
            defaultValue: addressLoaded
              ? "Company data loaded"
              : "Company data partially loaded",
          },
        ),
        description: t(descriptionKey, descriptionOptions),
        subject,
      });
    },
    [applyFetchedData, t],
  );

  const handleMatchSelection = useCallback(
    (match: CustomerDataMatch) => {
      setLoadedNotice({
        nip: match.subject.nip ?? normalizedNip,
        source: "fakturownia-client",
        subject: match.subject,
      });
      setMatchesDialogOpen(false);
    },
    [normalizedNip, setLoadedNotice],
  );

  const fetchData = useCallback(
    async (nip: string) => {
      cancelPending();

      const controller = new AbortController();
      abortRef.current = controller;

      setNotice({
        kind: "loading",
        nip,
        title: t("forms.getCustomerDataDialog.alerts.loadingTitle", {
          defaultValue: "Loading company data…",
        }),
        description: t(
          "forms.getCustomerDataDialog.alerts.loadingDescription",
          {
            defaultValue: "Looking up company data for NIP {{nip}}.",
            nip,
          },
        ),
      });

      try {
        const lookupResponse = await fetchCustomerData(nip, controller.signal);

        if (lastSeenNipRef.current !== nip) {
          return;
        }

        const subject = lookupResponse.subject;
        const errorMessage = lookupResponse.errors?.find(
          (value) => typeof value === "string" && value.trim().length > 0,
        );
        const matches = lookupResponse.matches ?? [];
        const noticeMessage = lookupResponse.notices?.find(
          (value) => typeof value === "string" && value.trim().length > 0,
        );

        if (matches.length > 1) {
          setNotice({
            kind: "warning",
            matches,
            nip,
            source: lookupResponse.source,
            title: t(
              "forms.getCustomerDataDialog.alerts.multipleClientsTitle",
              {
                defaultValue: "Multiple Fakturownia clients found",
              },
            ),
            description: t(
              "forms.getCustomerDataDialog.alerts.multipleClientsDescription",
              {
                defaultValue:
                  "Select which existing Fakturownia client should be used for NIP {{nip}}.",
                nip,
              },
            ),
          });
          setMatchesDialogOpen(true);
          return;
        }

        if (errorMessage && !subject) {
          const isHttpError = /^HTTP \d+$/.test(errorMessage);

          setNotice({
            kind: "error",
            nip,
            title: t("errors.somethingWentWrong", {
              defaultValue: "Something went wrong",
            }),
            description: isHttpError
              ? t("forms.getCustomerDataDialog.alerts.httpError", {
                  defaultValue:
                    "The company data could not be loaded. HTTP {{status}}.",
                  status: errorMessage.replace("HTTP ", ""),
                })
              : errorMessage,
          });
          return;
        }

        if (!subject) {
          setNotice({
            kind: "warning",
            nip,
            title: t("forms.getCustomerDataDialog.alerts.notFoundTitle", {
              defaultValue: "No company data found",
            }),
            description: t(
              "forms.getCustomerDataDialog.alerts.notFoundDescription",
              {
                defaultValue: "No company was found for NIP {{nip}}.",
                nip,
              },
            ),
          });
          return;
        }

        setLoadedNotice({
          nip,
          noticeMessage,
          source: lookupResponse.source,
          subject,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (lastSeenNipRef.current !== nip) {
          return;
        }

        console.error(error);
        setNotice({
          kind: "error",
          nip,
          title: t("errors.somethingWentWrong", {
            defaultValue: "Something went wrong",
          }),
          description: t(
            "forms.getCustomerDataDialog.alerts.errorDescription",
            {
              defaultValue:
                "The company data could not be loaded. Error: {{error}}",
              error: String(error),
            },
          ),
        });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [cancelPending, setLoadedNotice, t],
  );

  useEffect(() => {
    if (!fieldName) {
      return;
    }

    if (normalizedNip !== lastSeenNipRef.current) {
      lastSeenNipRef.current = normalizedNip;
      lastRequestedNipRef.current = null;
      setMatchesDialogOpen(false);
      setNotice((current) => (current?.nip === normalizedNip ? current : null));
    }

    cancelPending();

    if (lookupSequence === lastLookupSequenceRef.current) {
      return;
    }
    lastLookupSequenceRef.current = lookupSequence;

    if (!NIP_DIGITS_RE.test(normalizedNip)) {
      return;
    }

    if (lastRequestedNipRef.current === normalizedNip) {
      return;
    }

    typingTimer.current = setTimeout(() => {
      lastRequestedNipRef.current = normalizedNip;
      void fetchData(normalizedNip);
    }, DONE_TYPING_INTERVAL);

    return () => {
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
        typingTimer.current = null;
      }
    };
  }, [cancelPending, fetchData, fieldName, lookupSequence, normalizedNip]);

  useEffect(() => {
    if (
      !fieldName ||
      lookupSequence !== 0 ||
      !NIP_DIGITS_RE.test(normalizedNip)
    ) {
      setFetchedPrefilledFakturowniaCustomerDescriptions([]);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const descriptions =
          await fetchFakturowniaCustomerDescriptionsFromAdminRoute(
            normalizedNip,
            controller.signal,
          );
        setFetchedPrefilledFakturowniaCustomerDescriptions(descriptions);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(
          "[GetCustomerDataDialog] Fakturownia description lookup failed",
          error,
        );
        setFetchedPrefilledFakturowniaCustomerDescriptions([]);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [fieldName, lookupSequence, normalizedNip]);

  const visibleNotice = notice ?? renderedNotice;
  const fetchedFakturowniaDescription =
    visibleNotice?.source === "fakturownia-client"
      ? visibleNotice.subject?.description
      : undefined;
  const fakturowniaCustomerDescription = mergeCustomerDescriptions(
    prefilledFakturowniaCustomerDescription,
    ...fetchedPrefilledFakturowniaCustomerDescriptions,
    fetchedFakturowniaDescription,
  );

  if (!visibleNotice && !fakturowniaCustomerDescription) {
    return null;
  }

  const companyName = visibleNotice?.subject
    ? getCustomerDataCompanyName(visibleNotice.subject)
    : null;
  const address =
    visibleNotice?.subject?.workingAddress ??
    visibleNotice?.subject?.residenceAddress ??
    "-";

  return (
    <>
      {visibleNotice ? (
        <Presence
          present={!!notice}
          animationStyle={{
            _open: "scale-fade-in",
            _closed: "scale-fade-out",
          }}
          animationDuration="fast"
        >
          <Alert.Root
            status={
              visibleNotice.kind === "loading" ? "info" : visibleNotice.kind
            }
            mt={2}
            borderRadius="3xl"
            aria-live="polite"
          >
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{visibleNotice.title}</Alert.Title>
              <Alert.Description>
                <Text>{visibleNotice.description}</Text>
                {visibleNotice.matches && visibleNotice.matches.length > 1 ? (
                  <Button
                    mt={3}
                    size="xs"
                    onClick={() => setMatchesDialogOpen(true)}
                  >
                    {t("forms.getCustomerDataDialog.actions.selectClient", {
                      defaultValue: "Select client",
                    })}
                  </Button>
                ) : null}
                {visibleNotice.subject && (
                  <Box mt={2}>
                    {companyName ? (
                      <Text fontWeight="semibold">{companyName}</Text>
                    ) : null}
                    <Text translate="no">
                      {t("forms.labels.taxId", { defaultValue: "Tax ID" })}:{" "}
                      {visibleNotice.subject.nip ?? visibleNotice.nip}
                    </Text>
                    {visibleNotice.subject.regon ? (
                      <Text translate="no">
                        {t("forms.getCustomerDataDialog.labels.regon", {
                          defaultValue: "REGON",
                        })}
                        : {visibleNotice.subject.regon}
                      </Text>
                    ) : null}
                    {visibleNotice.subject.krs ? (
                      <Text translate="no">
                        {t("forms.getCustomerDataDialog.labels.krs", {
                          defaultValue: "KRS",
                        })}
                        : {visibleNotice.subject.krs}
                      </Text>
                    ) : null}
                    <Text>
                      {t("forms.headings.address", {
                        defaultValue: "Address",
                      })}
                      : {address}
                    </Text>
                  </Box>
                )}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        </Presence>
      ) : null}
      {fakturowniaCustomerDescription ? (
        <Alert.Root status="info" mt={2} borderRadius="3xl" aria-live="polite">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("forms.getCustomerDataDialog.alerts.clientDescriptionTitle", {
                defaultValue: "Fakturownia customer description",
              })}
            </Alert.Title>
            <Alert.Description>
              <Text whiteSpace="pre-wrap" overflowWrap="anywhere">
                {fakturowniaCustomerDescription}
              </Text>
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}
      {notice?.matches && notice.matches.length > 1 ? (
        <CustomerDataMatchesDialog
          matches={notice.matches}
          nip={notice.nip}
          onOpenChange={setMatchesDialogOpen}
          onSelect={handleMatchSelection}
          open={matchesDialogOpen}
          t={t}
        />
      ) : null}
    </>
  );
};
