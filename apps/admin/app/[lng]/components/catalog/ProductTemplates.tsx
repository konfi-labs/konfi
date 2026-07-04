"use client";

import { assertSaasRuntimeModuleAction } from "@/actions/saas-runtime-quotas";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
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
import { create, db, update } from "@konfi/firebase";
import {
  Attribute,
  CreateProductTemplate,
  Product,
  ProductTemplate,
} from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import dynamic from "next/dynamic";
import { useState } from "react";
import useSWR from "swr";

const Dropzone = dynamic(() => import("../Dropzone"), { ssr: false });

interface ProductTemplatesProps {
  product: Product;
  channelId: string;
  attributes: Attribute[];
}

const ProductTemplates = ({
  product,
  channelId,
  attributes,
}: ProductTemplatesProps) => {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const [open, setOpen] = useState(false);
  const [selectedAttributeOptions, setSelectedAttributeOptions] = useState<
    string[]
  >([]);

  const { data: templateItems, mutate } = useSWR(
    channelId && product?.id
      ? `channels/${channelId}/products/${product.id}/templates`
      : null,
    async (path) => await fetchProductTemplates(path),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const productAttributes = attributes.filter((attr) =>
    product.attributes.includes(attr.id),
  );

  async function fetchProductTemplates(
    path: string,
  ): Promise<ProductTemplate[]> {
    try {
      const { getDocs, query, collection } = await import("firebase/firestore");
      const { getDownloadURL, ref } = await import("firebase/storage");
      const { firestore, storage } = await import("@/lib/firebase/clientApp");

      const templatesRef = collection(firestore, path);
      const snapshot = await getDocs(query(templatesRef));

      const fetchedTemplates = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const template = {
            id: doc.id,
            ...doc.data(),
          } as ProductTemplate;

          const persistedDownloadUrl = template.downloadUrl?.trim();
          if (persistedDownloadUrl || !template.filePath) {
            return template;
          }

          try {
            const templateRef = ref(storage, template.filePath);
            const downloadUrl = await getDownloadURL(templateRef);

            await update(
              { downloadUrl },
              db.doc(firestore, path, template.id),
              tenantContext,
            );

            return {
              ...template,
              downloadUrl,
            };
          } catch (error) {
            console.error(
              `Error backfilling template URL for ${template.fileName}:`,
              error,
            );
            return template;
          }
        }),
      );

      return fetchedTemplates;
    } catch (error) {
      console.error("Error fetching templates:", error);
      return [];
    }
  }

  async function onFilesAccepted(files: File[]) {
    try {
      await assertSaasRuntimeModuleAction({
        module: "fileProofing",
        operation: "admin.product-template.create",
      });
      const upload = (await import("@/lib/firebase/storage")).upload;
      const { firestore } = await import("@/lib/firebase/clientApp");

      for (const file of files) {
        const templateData: CreateProductTemplate = {
          fileName: file.name,
          filePath: "",
          attributeOptions: selectedAttributeOptions,
          channelId: channelId,
          productId: product.id,
          name: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension
          active: true,
        };

        const id = await create(
          firestore,
          templateData,
          undefined,
          db.collection(
            firestore,
            `channels/${channelId}/products/${product.id}/templates`,
          ),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          tenantContext,
        );
        const filePath = `channels/${channelId}/products/${product.id}/templates/${id}/${file.name}`;

        await upload([{ file, url: filePath }]);

        if (!isUndefined(id)) {
          // Get download URL after successful upload
          const { getDownloadURL, ref } = await import("firebase/storage");
          const { storage } = await import("@/lib/firebase/clientApp");
          const fileRef = ref(storage, filePath);
          const downloadUrl = await getDownloadURL(fileRef);

          await update(
            { filePath, downloadUrl },
            db.doc(
              firestore,
              `channels/${channelId}/products/${product.id}/templates`,
              id,
            ),
            tenantContext,
          );
        }
      }

      mutate();
      setSelectedAttributeOptions([]);
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("admin.templatesAdded", {
          defaultValue: "Templates have been added",
        }),
        duration: 3000,
      });
    } catch (error) {
      console.error("Error uploading templates:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.templatesAddFailed", {
          defaultValue: "Failed to add templates",
        }),
        duration: 3000,
      });
    }
  }

  async function onTemplateDelete(template: ProductTemplate) {
    try {
      const { deleteObject } = await import("@/lib/firebase/storage");
      const { deleteDoc, doc } = await import("firebase/firestore");
      const { firestore } = await import("@/lib/firebase/clientApp");

      // Delete file from storage
      await deleteObject(template.filePath);

      // Delete template document from Firestore
      const templateRef = doc(
        firestore,
        `channels/${channelId}/products/${product.id}/templates`,
        template.id,
      );
      await deleteDoc(templateRef);

      mutate();
      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("admin.templateDeleted", {
          defaultValue: "Template has been deleted",
        }),
        duration: 3000,
      });
    } catch (error) {
      console.error("Error deleting template:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.templateDeleteFailed", {
          defaultValue: "Failed to delete template",
        }),
        duration: 3000,
      });
    }
  }

  async function onTemplateDownload(template: ProductTemplate) {
    try {
      const { download } = await import("@/lib/firebase/storage");
      await download(template.filePath);
    } catch (error) {
      console.error("Error downloading template:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.templateDownloadFailed", {
          defaultValue: "Failed to download template",
        }),
        duration: 3000,
      });
    }
  }

  async function onTemplatePreview(template: ProductTemplate) {
    try {
      const { download } = await import("@/lib/firebase/storage");
      await download(template.filePath, true);
    } catch (error) {
      console.error("Error previewing template:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("admin.templatePreviewFailed", {
          defaultValue: "Failed to open template preview",
        }),
        duration: 3000,
      });
    }
  }

  function handleAttributeOptionChange(
    attributeId: string,
    optionValue?: string[],
  ) {
    if (isUndefined(optionValue)) return;

    // If no options are selected filter all possible options
    if (isEmpty(optionValue)) {
      const attributeOptions =
        productAttributes
          .find((attr) => attr.id === attributeId)
          ?.options.map((option) => option.value) || [];
      setSelectedAttributeOptions((prev) =>
        prev.filter((val) => !attributeOptions.includes(val)),
      );
      return;
    }

    // Check if all values in optionValue are already selected
    const allSelected = optionValue.every((val) =>
      selectedAttributeOptions.includes(val),
    );

    if (allSelected) {
      // Remove all values in optionValue from selectedAttributeOptions
      setSelectedAttributeOptions((prev) =>
        prev.filter((val) => !optionValue.includes(val)),
      );
    } else {
      // Add all values in optionValue that are not already selected
      setSelectedAttributeOptions((prev) => [
        ...prev,
        ...optionValue.filter((val) => !prev.includes(val)),
      ]);
    }
  }

  function getAttributeOptionsText(attributeOptions: string[]): string {
    return attributeOptions.length > 0
      ? attributeOptions.join(", ")
      : t("admin.noOptionsSelected", { defaultValue: "No options selected" });
  }

  return (
    <Box
      p={6}
      border={"1px solid"}
      borderRadius={"3xl"}
      borderColor={"gray.muted"}
    >
      <HStack justify="space-between" mb={4}>
        <Text fontSize="lg" fontWeight="bold">
          {t("admin.productTemplatesHeader", {
            defaultValue: "Product Templates",
          })}
        </Text>
        <Button size="sm" onClick={() => setOpen(true)}>
          <MaterialSymbol>add</MaterialSymbol>
          {t("admin.addTemplate", { defaultValue: "Add Template" })}
        </Button>
      </HStack>

      {templateItems && templateItems.length > 0 ? (
        <List.Root px={"4"} gap={"2"}>
          {templateItems.map((template) => (
            <List.Item key={template.id}>
              <VStack align="stretch" gap={2}>
                <HStack justify="space-between">
                  <VStack align="start" gap={1}>
                    <Text fontWeight="semibold">{template.fileName}</Text>
                    <Text
                      fontSize="sm"
                      color={{ base: "gray.600", _dark: "gray.400" }}
                    >
                      {t("admin.templateOptionsLabel", {
                        defaultValue: "Options:",
                      })}{" "}
                      {getAttributeOptionsText(template.attributeOptions)}
                    </Text>
                  </VStack>
                  <HStack>
                    <IconButton
                      size="sm"
                      onClick={() => onTemplatePreview(template)}
                      aria-label={t("admin.preview", {
                        defaultValue: "Preview",
                      })}
                    >
                      <MaterialSymbol>open_in_new</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => onTemplateDownload(template)}
                      aria-label={t("admin.download", {
                        defaultValue: "Download",
                      })}
                    >
                      <MaterialSymbol>download</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => onTemplateDelete(template)}
                      aria-label={t("common.delete", {
                        defaultValue: "Delete",
                      })}
                      colorPalette="red"
                    >
                      <MaterialSymbol>delete</MaterialSymbol>
                    </IconButton>
                  </HStack>
                </HStack>
              </VStack>
            </List.Item>
          ))}
        </List.Root>
      ) : (
        <Text color={{ base: "gray.600", _dark: "gray.400" }}>
          {t("admin.noTemplatesForProduct", {
            defaultValue: "No templates available for this product",
          })}
        </Text>
      )}
      <CustomDialog
        header={t("admin.addTemplateHeader", { defaultValue: "Add Template" })}
        open={open}
        setOpen={setOpen}
      >
        <VStack gap={4} align="stretch">
          <Box>
            <Heading size="sm" mb={2}>
              {t("admin.selectTemplateAttributeOptions", {
                defaultValue: "Select attribute options",
              })}
            </Heading>
            <VStack align="stretch" gap={3}>
              {productAttributes.map((attribute) => {
                // Filter options to only those available in the product
                const availableOptionValues =
                  product.attributeOptions?.[attribute.id] || [];
                const filteredOptions = attribute.options.filter((option) =>
                  availableOptionValues.includes(option.value),
                );
                const options = createListCollection({
                  items: filteredOptions.map((option) => ({
                    label: option.label,
                    value: option.value,
                  })),
                });

                return (
                  <Select.Root
                    key={attribute.id}
                    multiple
                    collection={options}
                    onValueChange={(value) =>
                      handleAttributeOptionChange(attribute.id, value.value)
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
          </Box>

          <Box>
            <Heading size="sm" mb={2}>
              {t("admin.selectTemplateFiles", {
                defaultValue: "Select files",
              })}
            </Heading>
            <Dropzone
              onFilesAccepted={onFilesAccepted}
              accept={{ "application/pdf": [] }}
              maxFiles={10}
              multiple={true}
            />
          </Box>
        </VStack>
      </CustomDialog>
    </Box>
  );
};

export default ProductTemplates;
