import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Flex,
  HStack,
  Portal,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import {
  getSuppliersByAttributeId,
  unlinkSupplierFromAttributeOption,
} from "@konfi/firebase";
import { Attribute, NestedMember, Supplier } from "@konfi/types";
import { useAuth } from "context/auth";
import { useConfiguration } from "context/configuration";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LinkSupplierToAttributeOptionDialog = dynamic(
  () => import("./LinkSupplierToAttributeOptionDialog"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

export default function AttributeDetailsDialog({
  attribute,
  isOpen,
  onClose,
}: {
  attribute: Attribute | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const { refreshAttributes } = useConfiguration();
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedOption, setSelectedOption] = useState<{
    value: string;
    label: string;
  } | null>(null);

  // Load suppliers when attribute changes
  useEffect(() => {
    if (!attribute) return;

    setLoadingSuppliers(true);
    getSuppliersByAttributeId(firestore, attribute.id)
      .then((suppliersList) => {
        setSuppliers(suppliersList);
      })
      .finally(() => setLoadingSuppliers(false));
  }, [attribute]);

  const handleLinkSupplier = (optionValue: string, optionLabel: string) => {
    setSelectedOption({ value: optionValue, label: optionLabel });
    setShowLinkDialog(true);
  };

  const handleUnlinkSupplier = async (
    optionValue: string,
    supplierId: string,
  ) => {
    if (!attribute || !user) return;

    try {
      const currentUser: NestedMember = {
        id: user.uid,
        name: user.displayName || user.email || "Unknown User",
      };

      await unlinkSupplierFromAttributeOption(
        firestore,
        attribute.id,
        optionValue,
        supplierId,
        currentUser,
      );
      toaster.success({
        title: t("common.success"),
        description: t("admin.supplierUnlinkedFromOptionSuccess"),
        duration: 5000,
      });
      refreshAttributes();
      // Refresh suppliers list
      getSuppliersByAttributeId(firestore, attribute.id).then(setSuppliers);
    } catch (error) {
      toaster.error({
        title: t("common.error"),
        description: t("admin.supplierUnlinkFromOptionError"),
        duration: 5000,
      });
    }
  };

  const handleLinkSuccess = () => {
    refreshAttributes();
    setShowLinkDialog(false);
    setSelectedOption(null);
    // Refresh suppliers list
    if (attribute) {
      getSuppliersByAttributeId(firestore, attribute.id).then(setSuppliers);
    }
  };

  // Helper function to get suppliers for a specific option
  const getSuppliersForOption = (optionValue: string): Supplier[] => {
    return suppliers.filter((supplier) =>
      supplier.linkedAttributeOptions?.some(
        (option) =>
          option.attributeId === attribute?.id &&
          option.optionValue === optionValue,
      ),
    );
  };

  if (!attribute) return null;

  const currentUser: NestedMember | null = user
    ? {
        id: user.uid,
        name: user.displayName || user.email || "Unknown User",
      }
    : null;

  return (
    <>
      <Dialog.Root
        open={isOpen}
        onOpenChange={(details) => !details.open && onClose()}
        size="xl"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Text fontSize="lg" fontWeight="bold">
                  {attribute.name} - {t("admin.attributeDetails")}
                </Text>
              </Dialog.Header>
              <Dialog.CloseTrigger />
              <Dialog.Body>
                <Stack gap={4}>
                  {/* Basic Information */}
                  <Card.Root borderRadius={"3xl"}>
                    <Card.Body>
                      <Stack gap={3}>
                        <Text fontWeight="semibold">
                          {t("forms.headings.basicInformation")}
                        </Text>
                        <HStack>
                          <Text>{t("common.name")}:</Text>
                          <Text fontWeight="medium">{attribute.name}</Text>
                        </HStack>
                        <HStack wrap="wrap" gap={2}>
                          {attribute.calculated && (
                            <Badge colorPalette="orange">
                              {t("admin.affectsPrice")}
                            </Badge>
                          )}
                          {attribute.required && (
                            <Badge colorPalette="red">
                              {t("admin.required")}
                            </Badge>
                          )}
                          {attribute.format && (
                            <Badge colorPalette="primary">
                              {t("admin.format")}
                            </Badge>
                          )}
                          {attribute.pages && (
                            <Badge colorPalette="primary">
                              {t("admin.pageCount")}
                            </Badge>
                          )}
                        </HStack>
                      </Stack>
                    </Card.Body>
                  </Card.Root>

                  {/* Options with Suppliers */}
                  <Card.Root borderRadius={"3xl"}>
                    <Card.Body>
                      <Stack gap={3}>
                        <Text fontWeight="semibold">
                          {t("admin.optionsWithSuppliers")}
                        </Text>
                        {attribute.options.map((option, index) => (
                          <Card.Root
                            key={option.value}
                            variant="outline"
                            borderRadius="3xl"
                          >
                            <Card.Body>
                              <Stack gap={3}>
                                <Flex justify="space-between" align="center">
                                  <div>
                                    <Text fontWeight="medium">
                                      {option.label}
                                    </Text>
                                    <Text fontSize="sm" color="fg.muted">
                                      {t("forms.helperTexts.value")}:{" "}
                                      {option.value}
                                    </Text>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleLinkSupplier(
                                        option.value,
                                        option.label,
                                      )
                                    }
                                    disabled={!currentUser}
                                  >
                                    <MaterialSymbol>add_link</MaterialSymbol>
                                    {t("admin.linkSupplier")}
                                  </Button>
                                </Flex>

                                {/* Linked Suppliers */}
                                {(() => {
                                  const optionSuppliers = getSuppliersForOption(
                                    option.value,
                                  );
                                  return optionSuppliers.length > 0 ? (
                                    <div>
                                      <Text
                                        fontSize="sm"
                                        fontWeight="medium"
                                        mb={2}
                                      >
                                        {t("admin.linkedSuppliers")}:
                                      </Text>
                                      <Stack gap={2}>
                                        {loadingSuppliers ? (
                                          <Skeleton height="40px" />
                                        ) : (
                                          optionSuppliers.map((supplier) => (
                                            <Flex
                                              key={supplier.id}
                                              justify="space-between"
                                              align="center"
                                              p={2}
                                              bg="bg.subtle"
                                              borderRadius="md"
                                            >
                                              <div>
                                                <Text
                                                  fontSize="sm"
                                                  fontWeight="medium"
                                                >
                                                  {supplier.companyName}
                                                </Text>
                                                {supplier.isPreferred && (
                                                  <Badge
                                                    size="sm"
                                                    colorPalette="success"
                                                  >
                                                    {t("admin.preferred")}
                                                  </Badge>
                                                )}
                                              </div>
                                              <Button
                                                size="xs"
                                                variant="ghost"
                                                colorPalette="red"
                                                onClick={() =>
                                                  handleUnlinkSupplier(
                                                    option.value,
                                                    supplier.id,
                                                  )
                                                }
                                                disabled={!currentUser}
                                              >
                                                <MaterialSymbol>
                                                  link_off
                                                </MaterialSymbol>
                                                {t("common.unlink")}
                                              </Button>
                                            </Flex>
                                          ))
                                        )}
                                      </Stack>
                                    </div>
                                  ) : (
                                    <Text
                                      fontSize="sm"
                                      color="fg.muted"
                                      fontStyle="italic"
                                    >
                                      {t("admin.noSuppliersLinked")}
                                    </Text>
                                  );
                                })()}
                              </Stack>
                            </Card.Body>
                          </Card.Root>
                        ))}
                      </Stack>
                    </Card.Body>
                  </Card.Root>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={onClose}>
                  {t("common.close")}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Link Supplier Dialog */}
      {showLinkDialog && selectedOption && attribute && currentUser && (
        <LinkSupplierToAttributeOptionDialog
          attributeId={attribute.id}
          optionValue={selectedOption.value}
          optionLabel={selectedOption.label}
          isOpen={showLinkDialog}
          onClose={() => {
            setShowLinkDialog(false);
            setSelectedOption(null);
          }}
          onSuccess={handleLinkSuccess}
          currentUser={currentUser}
        />
      )}
    </>
  );
}
