import {
  searchFakturowniaClients,
  searchFakturowniaClientsByBuyerId,
} from "@/actions/fakturownia";
import { useT } from "@/i18n/client";
import { getNormalizedCountryCode } from "@/lib/fakturownia/country";
import { toaster } from "@konfi/components";
import type { Client } from "@konfi/fakturownia/out/client/models";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { UseFormGetValues, UseFormSetValue } from "react-hook-form";
import { fetchDataFromGovernmentNipApi } from "./invoice-form-position-builder";
import type { InvoiceFormValues } from "./invoice-form-types";
import {
  extractTaxIdDigits,
  findUniqueExactFakturowniaBuyerClient,
  findUniqueFakturowniaClientByRecipient,
  getFakturowniaClientTaxNo,
} from "./invoice-helpers";

type GovernmentNipData = NonNullable<
  Awaited<ReturnType<typeof fetchDataFromGovernmentNipApi>>
>;

interface FakturowniaInvoiceClientOrderSource {
  contact?: {
    email?: string;
    name?: string;
  } | null;
  billing?: {
    nip?: string;
  } | null;
  shipping?: {
    nip?: string;
  } | null;
}

interface UseFakturowniaInvoiceClientsArgs {
  getValues: UseFormGetValues<InvoiceFormValues>;
  setValue: UseFormSetValue<InvoiceFormValues>;
  primaryInvoiceSource?: FakturowniaInvoiceClientOrderSource;
  clientId?: string;
  recipientId?: string;
  buyerNameValue?: string;
  recipientNameValue?: string;
  recipientEnabled: boolean;
  recipientJstEnabled: boolean;
  isMountedRef: MutableRefObject<boolean>;
}

function getClientIdentifier(client: Client) {
  return client.id !== undefined && client.id !== null
    ? String(client.id)
    : undefined;
}

function upsertClientByIdOrTaxNo(clients: Client[], client: Client): Client[] {
  const normalizedTargetTax = extractTaxIdDigits(
    getFakturowniaClientTaxNo(client),
  );
  const existingIndex = clients.findIndex((item) => {
    if (
      client.id !== undefined &&
      client.id !== null &&
      item.id !== undefined &&
      item.id !== null
    ) {
      return item.id === client.id;
    }
    return (
      normalizedTargetTax !== "" &&
      extractTaxIdDigits(getFakturowniaClientTaxNo(item)) ===
        normalizedTargetTax
    );
  });
  if (existingIndex >= 0) {
    const next = [...clients];
    next[existingIndex] = client;
    return next;
  }
  return [client, ...clients];
}

export function useFakturowniaInvoiceClients({
  getValues,
  setValue,
  primaryInvoiceSource,
  clientId,
  recipientId,
  buyerNameValue,
  recipientNameValue,
  recipientEnabled,
  recipientJstEnabled,
  isMountedRef,
}: UseFakturowniaInvoiceClientsArgs) {
  const { t } = useT(["fakturownia", "translation"]);
  const [buyerClientSuggestions, setBuyerClientSuggestions] = useState<
    Client[]
  >([]);
  const [recipientClientSuggestions, setRecipientClientSuggestions] = useState<
    Client[]
  >([]);
  const [isBuyerComboboxLoading, setIsBuyerComboboxLoading] = useState(false);
  const [isRecipientComboboxLoading, setIsRecipientComboboxLoading] =
    useState(false);
  const [isBuyerNipLookupLoading, setIsBuyerNipLookupLoading] = useState(false);
  const [isRecipientNipLookupLoading, setIsRecipientNipLookupLoading] =
    useState(false);
  const [isBuyerDetailsOpen, setIsBuyerDetailsOpen] = useState(false);
  const [isRecipientDetailsOpen, setIsRecipientDetailsOpen] = useState(false);
  const [buyerChoiceOpen, setBuyerChoiceOpen] = useState(false);
  const [buyerChoiceNip, setBuyerChoiceNip] = useState("");
  const [recipientChoiceOpen, setRecipientChoiceOpen] = useState(false);
  const [recipientChoiceNip, setRecipientChoiceNip] = useState("");
  const [buyerDialogClients, setBuyerDialogClients] = useState<Client[]>([]);
  const [recipientDialogClients, setRecipientDialogClients] = useState<
    Client[]
  >([]);
  const [buyerClientDescription, setBuyerClientDescription] = useState<
    string | undefined
  >(undefined);
  const [buyerDescriptionDialogOpen, setBuyerDescriptionDialogOpen] =
    useState(false);
  const [pendingBuyerClient, setPendingBuyerClient] = useState<Client | null>(
    null,
  );
  const [sellerPersonFilterTerm, setSellerPersonFilterTerm] = useState("");
  const [buyerNameInputValue, setBuyerNameInputValue] = useState("");
  const [recipientNameInputValue, setRecipientNameInputValue] = useState("");
  const verifiedOrderBuyerNipRef = useRef<string | null>(null);
  const initializedBuyerNipRef = useRef<string | null>(null);
  const verifiedOrderRecipientNipRef = useRef<string | null>(null);
  const appliedJstRecipientClientKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (clientId) {
      return;
    }
    const nextValue = buyerNameValue ?? "";
    setBuyerNameInputValue((currentValue) =>
      currentValue === nextValue ? currentValue : nextValue,
    );
  }, [buyerNameValue, clientId]);

  useEffect(() => {
    if (recipientId) {
      return;
    }
    const nextValue = recipientNameValue ?? "";
    setRecipientNameInputValue((currentValue) =>
      currentValue === nextValue ? currentValue : nextValue,
    );
  }, [recipientId, recipientNameValue]);

  const applyBuyerGovernmentData = useCallback(
    (govData: GovernmentNipData) => {
      setValue("buyerName", govData.name, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setBuyerNameInputValue(govData.name);
      setValue("buyerTaxNo", govData.taxNo, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("buyerStreet", govData.street, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("buyerPostalCode", govData.postCode, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("buyerCity", govData.city, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("buyerCountry", getNormalizedCountryCode(govData.country), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setBuyerClientDescription(undefined);
      const currentBuyerEmail = getValues("buyerEmail");
      if (
        (typeof currentBuyerEmail !== "string" ||
          currentBuyerEmail.trim() === "") &&
        primaryInvoiceSource?.contact?.email
      ) {
        setValue("buyerEmail", primaryInvoiceSource.contact.email, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    },
    [getValues, primaryInvoiceSource?.contact?.email, setValue],
  );

  const applyRecipientGovernmentData = useCallback(
    (govData: GovernmentNipData) => {
      setValue("recipientName", govData.name, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setRecipientNameInputValue(govData.name);
      setValue("recipientTaxNo", govData.taxNo, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientStreet", govData.street, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientPostalCode", govData.postCode, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientCity", govData.city, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientCountry", getNormalizedCountryCode(govData.country), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [setValue],
  );

  const applyBuyerClientData = useCallback(
    (client: Client) => {
      setValue("clientId", getClientIdentifier(client), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      const buyerName = client.name || "";
      setValue("buyerName", buyerName, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setBuyerNameInputValue(buyerName);
      setValue("buyerTaxNo", getFakturowniaClientTaxNo(client) ?? "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      const note = typeof client.note === "string" ? client.note.trim() : "";
      setBuyerClientDescription(note !== "" ? note : undefined);

      const currentBuyerEmail = getValues("buyerEmail");
      const clientEmail = (client.email ?? "").trim();
      if (clientEmail !== "") {
        setValue("buyerEmail", clientEmail, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      } else if (
        (typeof currentBuyerEmail !== "string" ||
          currentBuyerEmail.trim() === "") &&
        primaryInvoiceSource?.contact?.email
      ) {
        setValue("buyerEmail", primaryInvoiceSource.contact.email, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }

      setValue("buyerPhone", client.phone || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("buyerStreet", client.street || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("buyerPostalCode", client.postCode || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("buyerCity", client.city || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("buyerCountry", getNormalizedCountryCode(client.country, "PL"), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      const currentBuyerPerson = getValues("buyerPerson");
      if (
        (typeof currentBuyerPerson !== "string" ||
          currentBuyerPerson.trim() === "") &&
        primaryInvoiceSource?.contact?.name
      ) {
        setValue("buyerPerson", primaryInvoiceSource.contact.name, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }

      if (client.priceListId) {
        setValue("priceListId", String(client.priceListId), {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
      setBuyerClientSuggestions((previous) =>
        upsertClientByIdOrTaxNo(previous, client),
      );
    },
    [
      getValues,
      primaryInvoiceSource?.contact?.email,
      primaryInvoiceSource?.contact?.name,
      setValue,
    ],
  );

  const applyRecipientClientData = useCallback(
    (client: Client) => {
      setValue("recipientId", getClientIdentifier(client), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      const recipientName = client.name || "";
      setValue("recipientName", recipientName, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setRecipientNameInputValue(recipientName);
      setValue("recipientTaxNo", getFakturowniaClientTaxNo(client) ?? "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientEmail", client.email || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientPhone", client.phone || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientStreet", client.street || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientPostalCode", client.postCode || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue("recipientCity", client.city || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue(
        "recipientCountry",
        getNormalizedCountryCode(client.country, "PL"),
        {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        },
      );
      setValue("recipientNote", client.note || "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setRecipientClientSuggestions((previous) =>
        upsertClientByIdOrTaxNo(previous, client),
      );
    },
    [setValue],
  );

  const handleBuyerClientSelection = useCallback(
    (client: Client) => {
      const note = typeof client.note === "string" ? client.note.trim() : "";
      if (note !== "") {
        setPendingBuyerClient(client);
        setBuyerDescriptionDialogOpen(true);
      } else {
        applyBuyerClientData(client);
      }
    },
    [applyBuyerClientData],
  );

  const confirmBuyerClientSelection = useCallback(() => {
    if (pendingBuyerClient) {
      applyBuyerClientData(pendingBuyerClient);
      setPendingBuyerClient(null);
      setBuyerDescriptionDialogOpen(false);
    }
  }, [applyBuyerClientData, pendingBuyerClient]);

  const cancelBuyerClientSelection = useCallback(() => {
    setPendingBuyerClient(null);
    setBuyerDescriptionDialogOpen(false);
  }, []);

  const findExactBuyerClientFromCurrentValues = useCallback(
    (clients: readonly Client[]) =>
      findUniqueExactFakturowniaBuyerClient(clients, {
        city: getValues("buyerCity"),
        name: getValues("buyerName"),
        postCode: getValues("buyerPostalCode"),
        street: getValues("buyerStreet"),
        taxNo: getValues("buyerTaxNo"),
      }),
    [getValues],
  );

  const openBuyerChoiceDialog = useCallback(
    (clients: Client[], nip: string) => {
      setBuyerDialogClients(clients);
      setBuyerChoiceNip(nip);
      setBuyerChoiceOpen(true);
    },
    [],
  );

  const openRecipientChoiceDialog = useCallback(
    (clients: Client[], nip: string) => {
      setRecipientDialogClients(clients);
      setRecipientChoiceNip(nip);
      setRecipientChoiceOpen(true);
    },
    [],
  );

  const handleSearchBuyerByNip = useCallback(
    async (nip: string) => {
      const trimmed = nip.trim();
      if (!trimmed) {
        setBuyerClientSuggestions([]);
        setValue("clientId", undefined, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
        return;
      }
      setIsBuyerNipLookupLoading(true);
      setIsBuyerComboboxLoading(true);
      try {
        const results = await searchFakturowniaClients(trimmed);

        if (results.length === 0) {
          const govData = await fetchDataFromGovernmentNipApi(trimmed);
          if (govData) {
            applyBuyerGovernmentData(govData);
            toaster.success({
              title: t("forms.getCustomerDataDialog.toasts.dataFetchedTitle", {
                defaultValue: "Data fetched",
              }),
              description: t(
                "forms.getCustomerDataDialog.toasts.dataFetchedDescription",
                {
                  defaultValue: "Company data loaded from government registry",
                  nip: trimmed,
                },
              ),
            });
            setBuyerClientSuggestions([]);
            return;
          }
        }

        setBuyerClientSuggestions(results);
        if (results.length > 1) {
          const exactBuyerClient =
            findExactBuyerClientFromCurrentValues(results);
          if (exactBuyerClient) {
            handleBuyerClientSelection(exactBuyerClient);
          } else {
            openBuyerChoiceDialog(results, trimmed);
          }
        } else if (results.length === 1) {
          handleBuyerClientSelection(results[0]);
        }
      } catch (error) {
        console.error("Error searching clients", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("fakturownia.invoiceCreate.clientSearchError", {
            defaultValue: "Unable to search clients",
          }),
        });
      } finally {
        setIsBuyerNipLookupLoading(false);
        setIsBuyerComboboxLoading(false);
      }
    },
    [
      applyBuyerGovernmentData,
      findExactBuyerClientFromCurrentValues,
      handleBuyerClientSelection,
      openBuyerChoiceDialog,
      setValue,
      t,
    ],
  );

  const handleSearchRecipientByNip = useCallback(
    async (nip: string) => {
      const trimmed = nip.trim();
      if (!trimmed) {
        setRecipientClientSuggestions([]);
        setValue("recipientId", undefined, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
        return;
      }
      setIsRecipientNipLookupLoading(true);
      setIsRecipientComboboxLoading(true);
      try {
        const results = await searchFakturowniaClients(trimmed);

        if (results.length === 0) {
          const govData = await fetchDataFromGovernmentNipApi(trimmed);
          if (govData) {
            applyRecipientGovernmentData(govData);
            toaster.success({
              title: t("forms.getCustomerDataDialog.toasts.dataFetchedTitle", {
                defaultValue: "Data fetched",
              }),
              description: t(
                "forms.getCustomerDataDialog.toasts.dataFetchedDescription",
                {
                  defaultValue: "Company data loaded from government registry",
                  nip: trimmed,
                },
              ),
            });
            setRecipientClientSuggestions([]);
            return;
          }
        }

        setRecipientClientSuggestions(results);
        if (results.length > 1) {
          openRecipientChoiceDialog(results, trimmed);
        } else if (results.length === 1) {
          applyRecipientClientData(results[0]);
        }
      } catch (error) {
        console.error("Error searching recipient clients", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("fakturownia.invoiceCreate.recipientSearchError", {
            defaultValue: "Unable to search recipients",
          }),
        });
      } finally {
        setIsRecipientNipLookupLoading(false);
        setIsRecipientComboboxLoading(false);
      }
    },
    [
      applyRecipientClientData,
      applyRecipientGovernmentData,
      openRecipientChoiceDialog,
      setValue,
      t,
    ],
  );

  const fillMissingRecipientTaxNoFromFakturowniaRecipient =
    useCallback(async () => {
      const currentRecipientName = getValues("recipientName");
      const recipientName =
        [currentRecipientName, recipientNameValue, recipientNameInputValue]
          .find(
            (value): value is string =>
              typeof value === "string" && value.trim() !== "",
          )
          ?.trim() ?? "";
      if (!clientId && recipientName.length < 2) {
        return;
      }

      setIsRecipientComboboxLoading(true);
      try {
        const linkedResults = clientId
          ? await searchFakturowniaClientsByBuyerId(clientId)
          : [];
        const results =
          linkedResults.length > 0
            ? linkedResults
            : recipientName.length >= 2
              ? await searchFakturowniaClients(recipientName)
              : [];
        setRecipientClientSuggestions(results);
        const matchingClient = findUniqueFakturowniaClientByRecipient(results, {
          buyerId: clientId,
          city: getValues("recipientCity"),
          name: recipientName,
          postCode: getValues("recipientPostalCode"),
          street: getValues("recipientStreet"),
        });
        const singleLinkedClient =
          linkedResults.length === 1 ? linkedResults[0] : undefined;
        const singleLinkedTaxNo = singleLinkedClient
          ? getFakturowniaClientTaxNo(singleLinkedClient)
          : undefined;
        const selectedRecipientClient = singleLinkedTaxNo
          ? singleLinkedClient
          : matchingClient;
        const selectedRecipientClientId = selectedRecipientClient
          ? getClientIdentifier(selectedRecipientClient)
          : undefined;
        const selectedRecipientClientKey = selectedRecipientClientId
          ? `${clientId ?? ""}:${selectedRecipientClientId}`
          : undefined;
        const matchingTaxNo = selectedRecipientClient
          ? getFakturowniaClientTaxNo(selectedRecipientClient)
          : undefined;
        if (
          selectedRecipientClient &&
          matchingTaxNo &&
          selectedRecipientClientKey !== appliedJstRecipientClientKeyRef.current
        ) {
          appliedJstRecipientClientKeyRef.current =
            selectedRecipientClientKey ?? null;
          applyRecipientClientData(selectedRecipientClient);
        }
      } catch (error) {
        console.error(
          "Error filling recipient tax id from Fakturownia recipient",
          error,
        );
      } finally {
        setIsRecipientComboboxLoading(false);
      }
    }, [
      applyRecipientClientData,
      clientId,
      getValues,
      recipientNameInputValue,
      recipientNameValue,
    ]);

  useEffect(() => {
    if (!recipientJstEnabled) {
      appliedJstRecipientClientKeyRef.current = null;
      return;
    }
    void fillMissingRecipientTaxNoFromFakturowniaRecipient();
  }, [fillMissingRecipientTaxNoFromFakturowniaRecipient, recipientJstEnabled]);

  useEffect(() => {
    if (!clientId || recipientEnabled || recipientJstEnabled) {
      return;
    }

    let cancelled = false;
    setIsRecipientComboboxLoading(true);
    void (async () => {
      try {
        const linkedResults = await searchFakturowniaClientsByBuyerId(clientId);
        if (cancelled) {
          return;
        }

        setRecipientClientSuggestions(linkedResults);
        const linkedRecipient =
          linkedResults.length === 1 ? linkedResults[0] : undefined;
        const linkedRecipientId = linkedRecipient
          ? getClientIdentifier(linkedRecipient)
          : undefined;

        if (!linkedRecipient || !linkedRecipientId) {
          return;
        }

        appliedJstRecipientClientKeyRef.current = `${clientId}:${linkedRecipientId}`;
        setValue("recipientEnabled", true, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
        setValue("recipientRole", "jst", {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
        applyRecipientClientData(linkedRecipient);
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Error enabling JST from linked Fakturownia recipient",
            error,
          );
        }
      } finally {
        if (!cancelled) {
          setIsRecipientComboboxLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyRecipientClientData,
    clientId,
    recipientEnabled,
    recipientJstEnabled,
    setValue,
  ]);

  useEffect(() => {
    const term = (buyerNameValue ?? "").trim();
    if (term.length < 2) {
      if (term === "") {
        setBuyerClientSuggestions((previous) => (clientId ? previous : []));
      }
      setIsBuyerComboboxLoading(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          if (!cancelled) {
            setIsBuyerComboboxLoading(true);
          }
          const results = await searchFakturowniaClients(term);
          if (!cancelled) {
            setBuyerClientSuggestions(results);
          }
        } catch (error) {
          if (!cancelled) {
            console.error("Error searching clients by name", error);
          }
        } finally {
          if (!cancelled) {
            setIsBuyerComboboxLoading(false);
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [buyerNameValue, clientId]);

  useEffect(() => {
    if (!recipientEnabled) {
      setIsRecipientComboboxLoading(false);
      setIsRecipientNipLookupLoading(false);
      return;
    }
    const term = (recipientNameValue ?? "").trim();
    if (term.length < 2) {
      if (term === "") {
        setRecipientClientSuggestions((previous) =>
          recipientId ? previous : [],
        );
      }
      setIsRecipientComboboxLoading(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          if (!cancelled) {
            setIsRecipientComboboxLoading(true);
          }
          const results = await searchFakturowniaClients(term);
          if (!cancelled) {
            setRecipientClientSuggestions(results);
          }
        } catch (error) {
          if (!cancelled) {
            console.error("Error searching recipient clients by name", error);
          }
        } finally {
          if (!cancelled) {
            setIsRecipientComboboxLoading(false);
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [recipientEnabled, recipientId, recipientNameValue]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const rawNip = getValues("buyerTaxNo");
      const nip = typeof rawNip === "string" ? rawNip.trim() : "";
      if (!nip) {
        return;
      }
      const normalized = extractTaxIdDigits(nip);
      if (!normalized) {
        return;
      }
      initializedBuyerNipRef.current = normalized;
      setIsBuyerNipLookupLoading(true);
      setIsBuyerComboboxLoading(true);
      try {
        const results = await searchFakturowniaClients(nip);
        if (cancelled) {
          return;
        }

        if (results.length === 0) {
          const govData = await fetchDataFromGovernmentNipApi(nip);
          if (govData && !cancelled) {
            applyBuyerGovernmentData(govData);
            setBuyerClientSuggestions([]);
            toaster.create({
              title: t("fakturownia.invoiceCreate.buyerDataPopulated", {
                defaultValue: "Buyer data populated from government registry",
              }),
              type: "info",
            });
            return;
          }
        }
        setBuyerClientSuggestions(results);
        if (results.length > 1) {
          const exactBuyerClient =
            findExactBuyerClientFromCurrentValues(results);
          if (exactBuyerClient) {
            applyBuyerClientData(exactBuyerClient);
          } else {
            openBuyerChoiceDialog(results, nip);
          }
        } else if (results.length === 1) {
          applyBuyerClientData(results[0]);
          toaster.create({
            title: t("fakturownia.invoiceCreate.buyerClientFound", {
              defaultValue: "Buyer client found and populated",
            }),
            type: "success",
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error initializing client by buyerTaxNo", error);
        }
      } finally {
        if (!cancelled && isMountedRef.current) {
          setIsBuyerNipLookupLoading(false);
          setIsBuyerComboboxLoading(false);
        }
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [
    applyBuyerClientData,
    applyBuyerGovernmentData,
    findExactBuyerClientFromCurrentValues,
    getValues,
    isMountedRef,
    openBuyerChoiceDialog,
    t,
  ]);

  useEffect(() => {
    const nip = primaryInvoiceSource?.billing?.nip;
    if (!nip) {
      verifiedOrderBuyerNipRef.current = null;
      if (isMountedRef.current) {
        setIsBuyerNipLookupLoading(false);
        setIsBuyerComboboxLoading(false);
      }
      return;
    }
    const normalizedNip = extractTaxIdDigits(nip);
    if (!normalizedNip) {
      verifiedOrderBuyerNipRef.current = null;
      if (isMountedRef.current) {
        setIsBuyerNipLookupLoading(false);
        setIsBuyerComboboxLoading(false);
      }
      return;
    }
    if (initializedBuyerNipRef.current === normalizedNip) {
      return;
    }
    if (verifiedOrderBuyerNipRef.current === normalizedNip) {
      return;
    }
    verifiedOrderBuyerNipRef.current = normalizedNip;
    let cancelled = false;
    setIsBuyerNipLookupLoading(true);
    setIsBuyerComboboxLoading(true);
    void (async () => {
      try {
        const results = await searchFakturowniaClients(nip);
        if (cancelled) {
          return;
        }

        if (results.length === 0) {
          const govData = await fetchDataFromGovernmentNipApi(nip);
          if (govData && !cancelled) {
            applyBuyerGovernmentData(govData);
            setBuyerClientSuggestions([]);
            toaster.create({
              title: t("fakturownia.invoiceCreate.buyerDataPopulated", {
                defaultValue: "Buyer data populated from government registry",
              }),
              type: "info",
            });
            return;
          }
        }

        setBuyerClientSuggestions(results);
        if (results.length > 1) {
          const exactBuyerClient =
            findExactBuyerClientFromCurrentValues(results);
          if (exactBuyerClient) {
            applyBuyerClientData(exactBuyerClient);
          } else {
            openBuyerChoiceDialog(results, nip);
          }
        } else if (results.length === 1) {
          applyBuyerClientData(results[0]);
          toaster.create({
            title: t("fakturownia.invoiceCreate.buyerClientFound", {
              defaultValue: "Buyer client found and populated",
            }),
            type: "success",
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error verifying client by NIP", error);
        }
      } finally {
        if (cancelled) {
          verifiedOrderBuyerNipRef.current = null;
        }
        if (isMountedRef.current) {
          setIsBuyerNipLookupLoading(false);
          setIsBuyerComboboxLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    applyBuyerClientData,
    applyBuyerGovernmentData,
    findExactBuyerClientFromCurrentValues,
    isMountedRef,
    openBuyerChoiceDialog,
    primaryInvoiceSource?.billing?.nip,
    t,
  ]);

  useEffect(() => {
    if (!recipientEnabled) {
      verifiedOrderRecipientNipRef.current = null;
      if (isMountedRef.current) {
        setIsRecipientNipLookupLoading(false);
        setIsRecipientComboboxLoading(false);
        setIsRecipientDetailsOpen(false);
      }
      return;
    }
    const nip = primaryInvoiceSource?.shipping?.nip;
    if (!nip) {
      verifiedOrderRecipientNipRef.current = null;
      if (isMountedRef.current) {
        setIsRecipientNipLookupLoading(false);
        setIsRecipientComboboxLoading(false);
      }
      return;
    }
    const normalizedNip = extractTaxIdDigits(nip);
    if (!normalizedNip) {
      verifiedOrderRecipientNipRef.current = null;
      if (isMountedRef.current) {
        setIsRecipientNipLookupLoading(false);
        setIsRecipientComboboxLoading(false);
      }
      return;
    }
    if (verifiedOrderRecipientNipRef.current === normalizedNip) {
      return;
    }
    verifiedOrderRecipientNipRef.current = normalizedNip;
    let cancelled = false;
    setIsRecipientNipLookupLoading(true);
    setIsRecipientComboboxLoading(true);
    void (async () => {
      try {
        const results = await searchFakturowniaClients(nip);
        if (cancelled) {
          return;
        }

        if (results.length === 0) {
          const govData = await fetchDataFromGovernmentNipApi(nip);
          if (govData && !cancelled) {
            applyRecipientGovernmentData(govData);
            setRecipientClientSuggestions([]);
            toaster.create({
              title: t("fakturownia.invoiceCreate.recipientDataPopulated", {
                defaultValue:
                  "Recipient data populated from government registry",
              }),
              type: "info",
            });
            return;
          }
        }

        setRecipientClientSuggestions(results);
        if (results.length > 1) {
          openRecipientChoiceDialog(results, nip);
        } else if (results.length === 1) {
          applyRecipientClientData(results[0]);
          toaster.create({
            title: t("fakturownia.invoiceCreate.recipientClientFound", {
              defaultValue: "Recipient client found and populated",
            }),
            type: "success",
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error verifying recipient client by NIP", error);
        }
      } finally {
        if (cancelled) {
          verifiedOrderRecipientNipRef.current = null;
        }
        if (isMountedRef.current) {
          setIsRecipientNipLookupLoading(false);
          setIsRecipientComboboxLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    applyRecipientClientData,
    applyRecipientGovernmentData,
    isMountedRef,
    openRecipientChoiceDialog,
    primaryInvoiceSource?.shipping?.nip,
    recipientEnabled,
    t,
  ]);

  return {
    buyerClientSuggestions,
    recipientClientSuggestions,
    isBuyerComboboxLoading,
    isRecipientComboboxLoading,
    isBuyerNipLookupLoading,
    isRecipientNipLookupLoading,
    isBuyerDetailsOpen,
    setIsBuyerDetailsOpen,
    isRecipientDetailsOpen,
    setIsRecipientDetailsOpen,
    buyerChoiceOpen,
    setBuyerChoiceOpen,
    buyerChoiceNip,
    recipientChoiceOpen,
    setRecipientChoiceOpen,
    recipientChoiceNip,
    buyerDialogClients,
    recipientDialogClients,
    buyerClientDescription,
    setBuyerClientDescription,
    buyerDescriptionDialogOpen,
    pendingBuyerClient,
    sellerPersonFilterTerm,
    setSellerPersonFilterTerm,
    buyerNameInputValue,
    setBuyerNameInputValue,
    recipientNameInputValue,
    setRecipientNameInputValue,
    applyRecipientClientData,
    handleBuyerClientSelection,
    confirmBuyerClientSelection,
    cancelBuyerClientSelection,
    handleSearchBuyerByNip,
    handleSearchRecipientByNip,
    fillMissingRecipientTaxNoFromFakturowniaRecipient,
  };
}
