"use client";

import { Notes } from "@/components/notes/Notes";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
  Grid,
  GridItem,
  Heading,
  HStack,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  CustomHeading,
  DataTable,
  MaterialSymbol,
  SpecialNotes,
  Tag,
} from "@konfi/components";
import { getNotes, getProductsByIds, getSupplier } from "@konfi/firebase";
import { CurrencyEnum, Product, Supplier } from "@konfi/types";
import { formatPrice } from "@konfi/utils";
import { createColumnHelper } from "@tanstack/react-table";
import { useSuppliers } from "context/suppliers";
import { isEmpty } from "es-toolkit/compat";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
const SupplierForm = dynamic(
  () => import("@/components/suppliers/SupplierForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

export default function SupplierPage() {
  const { t, i18n } = useT();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { unlinkProductFromSupplier } = useSuppliers();
  const {
    data: supplier,
    mutate,
    isLoading: isLoadingSupplier,
  } = useSWR(id, fetchSupplier, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateOnMount: true,
  });
  const columHelper = createColumnHelper<Product>();
  const bgColor = { base: "whiteAlpha.500", _dark: "blackAlpha.500" };
  const borderColor = { base: "whiteAlpha.500", _dark: "whiteAlpha.300" };
  const { data: linkedProducts, isLoading } = useSWR(
    !isEmpty(supplier?.linkedProductsIds) ? supplier?.linkedProductsIds : null,
    fetchLinkedProductsIds,
  );
  const { data: notes } = useSWRImmutable(
    supplier ? [supplier.id] : null,
    ([supplierId]) => getNotes(firestore, supplierId),
  );

  const [selectedProduct, setSelectedProduct] = useState<Product>();
  const [supplierForm, setSupplierForm] = useState(false);

  const productColumns = useMemo(
    () => [
      columHelper.accessor("name", {
        header: t("tables.headers.name", { defaultValue: "Name" }),
        cell: (info) => info.getValue(),
      }),
      {
        id: "actions",
        header: t("tables.headers.actions", { defaultValue: "Actions" }),
        cell: ({ row }: { row: { original: Product } }) => (
          <Button
            size="sm"
            colorPalette="red"
            variant="outline"
            onClick={() => {
              if (supplier?.id) {
                unlinkProductFromSupplier(row.original.id, supplier.id);
                mutate();
              }
            }}
          >
            <MaterialSymbol>link_off</MaterialSymbol>
            {t("admin.unlink", { defaultValue: "Unlink" })}
          </Button>
        ),
      },
    ],
    [t, supplier?.id, unlinkProductFromSupplier, mutate],
  );

  if (isLoadingSupplier) {
    return <Skeleton height="400px" />;
  }

  if (!supplier) {
    return (
      <Box textAlign="center" py={10}>
        <Text>
          {t("common.supplierNotFound", { defaultValue: "Supplier not found" })}
        </Text>
      </Box>
    );
  }

  return (
    <>
      <Grid templateColumns="1fr 300px" gap={6}>
        <GridItem>
          <Stack gap={6}>
            <HStack justify="space-between">
              <CustomHeading
                heading={supplier.companyName}
                size="xl"
                breadcrumb={true}
                goBack={true}
                t={t}
              />
              <Button
                size="sm"
                colorPalette="primary"
                variant="solid"
                onClick={() => setSupplierForm(true)}
              >
                <MaterialSymbol>edit</MaterialSymbol>
                {t("common.edit", { defaultValue: "Edit" })}
              </Button>
            </HStack>

            <Box
              bg={bgColor}
              borderColor={borderColor}
              borderWidth="1px"
              borderRadius="md"
              p={6}
            >
              <Heading size="md" mb={4}>
                {t("admin.supplierDetails", {
                  defaultValue: "Supplier Details",
                })}
              </Heading>
              <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                <Box>
                  <Text fontWeight="semibold">
                    {t("forms.labels.companyName", {
                      defaultValue: "Company Name",
                    })}
                  </Text>
                  <Text>{supplier.companyName}</Text>
                </Box>
                {supplier.contactPerson && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.contactPerson", {
                        defaultValue: "Contact Person",
                      })}
                    </Text>
                    <Text>{supplier.contactPerson}</Text>
                  </Box>
                )}
                {supplier.email && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.email", { defaultValue: "Email" })}
                    </Text>
                    <Text>{supplier.email}</Text>
                  </Box>
                )}
                {supplier.phone && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.phone", { defaultValue: "Phone" })}
                    </Text>
                    <Text>{supplier.phone}</Text>
                  </Box>
                )}
                {supplier.website && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.website", { defaultValue: "Website" })}
                    </Text>
                    <Text>{supplier.website}</Text>
                  </Box>
                )}
                {supplier.nip && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.nip", { defaultValue: "Tax ID" })}
                    </Text>
                    <Text>{supplier.nip}</Text>
                  </Box>
                )}
                {supplier.paymentTerms && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.paymentTerms", {
                        defaultValue: "Payment Terms",
                      })}
                    </Text>
                    <Text>{supplier.paymentTerms}</Text>
                  </Box>
                )}
                {supplier.currency && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.currency", { defaultValue: "Currency" })}
                    </Text>
                    <Text>{supplier.currency}</Text>
                  </Box>
                )}
                {supplier.leadTime && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.leadTime", {
                        defaultValue: "Lead Time",
                      })}
                    </Text>
                    <Text>
                      {supplier.leadTime}{" "}
                      {t("common.days", { defaultValue: "days" })}
                    </Text>
                  </Box>
                )}
                {supplier.minimumOrder && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.minimumOrder", {
                        defaultValue: "Minimum Order",
                      })}
                    </Text>
                    <Text>
                      {formatPrice(
                        supplier.minimumOrder,
                        (supplier.currency as CurrencyEnum) || CurrencyEnum.PLN,
                      )}
                    </Text>
                  </Box>
                )}
                {supplier.rating && (
                  <Box>
                    <Text fontWeight="semibold">
                      {t("forms.labels.rating", { defaultValue: "Rating" })}
                    </Text>
                    <HStack>
                      <Text>{supplier.rating}</Text>
                      <MaterialSymbol
                        color={{ base: "yellow.500", _dark: "yellow.300" }}
                      >
                        star
                      </MaterialSymbol>
                    </HStack>
                  </Box>
                )}
                <Box>
                  <Text fontWeight="semibold">
                    {t("forms.labels.preferredSupplier", {
                      defaultValue: "Preferred Supplier",
                    })}
                  </Text>
                  <Tag colorPalette={supplier.isPreferred ? "success" : "gray"}>
                    {supplier.isPreferred
                      ? t("common.yes", { defaultValue: "Yes" })
                      : t("common.no", { defaultValue: "No" })}
                  </Tag>
                </Box>
              </Grid>
            </Box>

            {supplier.specialNotes && (
              <SpecialNotes specialNotes={supplier.specialNotes} t={t} />
            )}

            {linkedProducts && linkedProducts.length > 0 && (
              <Box
                bg={bgColor}
                borderColor={borderColor}
                borderWidth="1px"
                borderRadius="md"
                p={6}
              >
                <Heading size="md" mb={4}>
                  {t("admin.linkedProducts", {
                    defaultValue: "Linked Products",
                  })}
                </Heading>
                <DataTable
                  data={linkedProducts}
                  columns={productColumns}
                  paginationType="uncontrolled"
                  loading={isLoading}
                  t={t}
                  i18n={i18n}
                />
              </Box>
            )}
          </Stack>
        </GridItem>

        <GridItem>
          <Notes notes={notes ?? []} />
        </GridItem>
      </Grid>

      <SupplierForm
        supplier={supplier}
        type="UPDATE"
        open={supplierForm}
        setOpen={setSupplierForm}
        onSuccess={() => {
          setSupplierForm(false);
          mutate();
        }}
      />
    </>
  );
}

async function fetchSupplier(id: string): Promise<Supplier | undefined> {
  return await getSupplier(firestore, id);
}

async function fetchLinkedProductsIds(
  linkedProductsIds: string[],
): Promise<Product[]> {
  return await getProductsByIds(firestore, linkedProductsIds, true);
}
