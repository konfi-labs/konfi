"use client";

import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  getProductImpositionTemplatesPath,
  mapProductImpositionTemplateLinkDocument,
  type CreateProductImpositionTemplateLink,
  type ProductImpositionTemplateLink,
} from "@/lib/product-imposition-templates";
import {
  Box,
  Button,
  createListCollection,
  Heading,
  HStack,
  IconButton,
  List,
  Select,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CustomDialog, MaterialSymbol, toaster } from "@konfi/components";
import { create, db, getImpositionWorkflows } from "@konfi/firebase";
import { Attribute, CreateImpositionWorkflow, Product } from "@konfi/types";
import { isUndefined, sortBy } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { deleteDoc, getDocs, query } from "firebase/firestore";
import { useMemo, useState } from "react";
import useSWR from "swr";

interface ProductImpositionTemplatesProps {
  product: Product;
  channelId: string;
  attributes: Attribute[];
}

async function fetchProductImpositionTemplates(path: string) {
  try {
    const snapshot = await getDocs(query(db.collection(firestore, path)));
    return snapshot.docs.map(mapProductImpositionTemplateLinkDocument);
  } catch (error) {
    console.error("Error fetching product imposition templates:", error);
    return [];
  }
}

async function fetchImpositionWorkflows() {
  return (await getImpositionWorkflows(firestore)) ?? [];
}

function areAttributeOptionSetsEqual(first: string[], second: string[]) {
  if (first.length !== second.length) return false;

  const firstSorted = [...first].sort();
  const secondSorted = [...second].sort();

  return firstSorted.every((option, index) => option === secondSorted[index]);
}

export default function ProductImpositionTemplates({
  product,
  channelId,
  attributes,
}: ProductImpositionTemplatesProps) {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const path = getProductImpositionTemplatesPath(channelId, product.id);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [deleteLink, setDeleteLink] =
    useState<ProductImpositionTemplateLink | null>(null);
  const [selectedAttributeOptions, setSelectedAttributeOptions] = useState<
    string[]
  >([]);

  const { data: links, mutate } = useSWR(
    path,
    fetchProductImpositionTemplates,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const { data: workflowsData, isLoading: loadingWorkflows } = useSWR(
    "impositionWorkflows",
    fetchImpositionWorkflows,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const productAttributes = useMemo(
    () =>
      attributes.filter((attribute) =>
        product.attributes.includes(attribute.id),
      ),
    [attributes, product.attributes],
  );
  const workflows = useMemo(
    () => sortBy(workflowsData ?? [], ["name"]),
    [workflowsData],
  );
  const workflowOptions = useMemo(
    () =>
      createListCollection({
        items: workflows.map((workflow) => ({
          label: workflow.name,
          value: workflow.id,
        })),
      }),
    [workflows],
  );

  function handleAttributeOptionChange(
    attributeId: string,
    optionValue?: string[],
  ) {
    if (isUndefined(optionValue)) return;

    const availableAttributeOptions =
      productAttributes
        .find((attribute) => attribute.id === attributeId)
        ?.options.map((option) => option.value) ?? [];

    if (isEmpty(optionValue)) {
      setSelectedAttributeOptions((previous) =>
        previous.filter((value) => !availableAttributeOptions.includes(value)),
      );
      return;
    }

    setSelectedAttributeOptions((previous) => [
      ...previous.filter((value) => !availableAttributeOptions.includes(value)),
      ...optionValue,
    ]);
  }

  function getAttributeOptionsText(attributeOptions: string[]) {
    return attributeOptions.length > 0
      ? attributeOptions.join(", ")
      : t("admin.impositionTemplates.allConfigurations", {
          defaultValue: "All configurations",
        });
  }

  async function handleAddLink() {
    const workflow = workflows.find(
      (workflow) => workflow.id === selectedWorkflowId,
    );

    if (!workflow) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.impositionTemplates.selectTemplateFirst", {
          defaultValue: "Select an imposition template first.",
        }),
      });
      return;
    }

    const duplicate = links?.some(
      (link) =>
        link.impositionWorkflowId === workflow.id &&
        areAttributeOptionSetsEqual(
          link.attributeOptions,
          selectedAttributeOptions,
        ),
    );

    if (duplicate) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.impositionTemplates.duplicate", {
          defaultValue:
            "This imposition template is already connected for the selected options.",
        }),
      });
      return;
    }

    try {
      await create(
        firestore,
        {
          impositionWorkflowId: workflow.id,
          impositionWorkflowName: workflow.name,
          attributeOptions: selectedAttributeOptions,
          channelId,
          productId: product.id,
        } satisfies CreateProductImpositionTemplateLink,
        undefined,
        db.collection(firestore, path),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        tenantContext,
      );
      setSelectedWorkflowId("");
      setSelectedAttributeOptions([]);
      await mutate();
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("admin.impositionTemplates.connected", {
          defaultValue: "Imposition template has been connected.",
        }),
      });
    } catch (error) {
      console.error("Error connecting imposition template:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.impositionTemplates.connectFailed", {
          defaultValue: "Failed to connect imposition template.",
        }),
      });
    }
  }

  async function handleDeleteLink(link: ProductImpositionTemplateLink) {
    try {
      await deleteDoc(db.doc(firestore, path, link.id));
      setDeleteLink(null);
      await mutate();
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("admin.impositionTemplates.disconnected", {
          defaultValue: "Imposition template has been disconnected.",
        }),
      });
    } catch (error) {
      console.error("Error disconnecting imposition template:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.impositionTemplates.disconnectFailed", {
          defaultValue: "Failed to disconnect imposition template.",
        }),
      });
    }
  }

  return (
    <Box p={6} border="1px solid" borderRadius="3xl" borderColor="gray.muted">
      <VStack align="stretch" gap={5}>
        <VStack align="stretch" gap={1}>
          <Text fontSize="lg" fontWeight="bold">
            {t("admin.impositionTemplates.title", {
              defaultValue: "Imposition templates",
            })}
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {t("admin.impositionTemplates.description", {
              defaultValue:
                "Connect saved imposition templates to product configurations.",
            })}
          </Text>
        </VStack>

        {links && links.length > 0 ? (
          <List.Root px={4} gap={2}>
            {links.map((link) => (
              <List.Item key={link.id}>
                <HStack justify="space-between" align="start" gap={4}>
                  <VStack align="start" gap={1}>
                    <Text fontWeight="semibold">
                      {link.impositionWorkflowName}
                    </Text>
                    <Text fontSize="sm" color="fg.muted">
                      {t("admin.templateOptionsLabel", {
                        defaultValue: "Options:",
                      })}{" "}
                      {getAttributeOptionsText(link.attributeOptions)}
                    </Text>
                  </VStack>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    colorPalette="red"
                    onClick={() => setDeleteLink(link)}
                    aria-label={t("admin.impositionTemplates.disconnect", {
                      defaultValue: "Disconnect imposition template",
                    })}
                  >
                    <MaterialSymbol>delete</MaterialSymbol>
                  </IconButton>
                </HStack>
              </List.Item>
            ))}
          </List.Root>
        ) : (
          <Text color="fg.muted">
            {t("admin.impositionTemplates.empty", {
              defaultValue:
                "No imposition templates connected to this product.",
            })}
          </Text>
        )}

        <VStack align="stretch" gap={4}>
          <Heading size="sm">
            {t("admin.impositionTemplates.addConnection", {
              defaultValue: "Add connection",
            })}
          </Heading>
          <Select.Root
            collection={workflowOptions}
            value={selectedWorkflowId ? [selectedWorkflowId] : []}
            onValueChange={(details) =>
              setSelectedWorkflowId(details.value[0] ?? "")
            }
            size="sm"
            disabled={loadingWorkflows || workflows.length === 0}
          >
            <Select.HiddenSelect />
            <Select.Label>
              {t("admin.impositionTemplates.templateLabel", {
                defaultValue: "Imposition template",
              })}
            </Select.Label>
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText
                  placeholder={t(
                    "admin.impositionTemplates.templatePlaceholder",
                    {
                      defaultValue: "Select imposition template...",
                    },
                  )}
                />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Select.Positioner>
              <Select.Content>
                {workflowOptions.items.map((option) => (
                  <Select.Item item={option} key={option.value}>
                    {option.label}
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Select.Root>

          <VStack align="stretch" gap={3}>
            {productAttributes.map((attribute) => {
              const availableOptionValues =
                product.attributeOptions?.[attribute.id] ?? [];
              const options = createListCollection({
                items: attribute.options
                  .filter((option) =>
                    availableOptionValues.includes(option.value),
                  )
                  .map((option) => ({
                    label: option.label,
                    value: option.value,
                  })),
              });

              return (
                <Select.Root
                  key={attribute.id}
                  multiple
                  collection={options}
                  value={selectedAttributeOptions.filter((option) =>
                    options.items.some((item) => item.value === option),
                  )}
                  onValueChange={(details) =>
                    handleAttributeOptionChange(attribute.id, details.value)
                  }
                  size="sm"
                >
                  <Select.HiddenSelect />
                  <Select.Label>{attribute.name}</Select.Label>
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t("admin.selectAttributePlaceholder", {
                          defaultValue: "Select attribute...",
                        })}
                      />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.ClearTrigger />
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      {options.items.map((option) => (
                        <Select.Item item={option} key={option.value}>
                          {option.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              );
            })}
          </VStack>

          <Button
            alignSelf="start"
            colorPalette="primary"
            onClick={handleAddLink}
            disabled={!selectedWorkflowId}
          >
            <MaterialSymbol>add_link</MaterialSymbol>
            {t("admin.impositionTemplates.connect", {
              defaultValue: "Connect template",
            })}
          </Button>
        </VStack>
      </VStack>
      <CustomDialog
        header={t("admin.impositionTemplates.disconnect", {
          defaultValue: "Disconnect imposition template",
        })}
        open={deleteLink !== null}
        setOpen={(nextOpen) => {
          const resolvedOpen =
            typeof nextOpen === "function"
              ? nextOpen(deleteLink !== null)
              : nextOpen;
          if (!resolvedOpen) setDeleteLink(null);
        }}
        size="md"
      >
        <VStack align="stretch" gap={4}>
          <Text>
            {t("admin.impositionTemplates.confirmDisconnect", {
              defaultValue:
                "Disconnect this imposition template from the product configuration?",
            })}
          </Text>
          <HStack justify="flex-end" gap={3}>
            <Button variant="outline" onClick={() => setDeleteLink(null)}>
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              colorPalette="red"
              onClick={() => {
                if (deleteLink) void handleDeleteLink(deleteLink);
              }}
            >
              {t("admin.impositionTemplates.disconnect", {
                defaultValue: "Disconnect imposition template",
              })}
            </Button>
          </HStack>
        </VStack>
      </CustomDialog>
    </Box>
  );
}
