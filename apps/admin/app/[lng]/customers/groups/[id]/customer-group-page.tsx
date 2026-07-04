"use client";

import CustomerGroupForm from "@/components/customers/CustomerGroupForm";
import {
  fetchCustomerGroup,
  fetchCustomerGroupMembers,
} from "@/components/customers/customer-groups";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Separator,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  AlertDialog,
  ButtonLink,
  CustomHeading,
  DataTable,
  Empty,
  IconButtonLink,
  MaterialSymbol,
  toaster,
} from "@konfi/components";
import { db, update } from "@konfi/firebase";
import type { Customer } from "@konfi/types";
import { formatDate } from "@konfi/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { Timestamp } from "firebase/firestore";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";
import useSWR from "swr";
import { useCustomers } from "context/customers";

type CustomerColumnDef = ColumnDef<Customer, unknown>;

function asCustomerColumnDef<TValue>(
  column: ColumnDef<Customer, TValue>,
): CustomerColumnDef {
  return column as unknown as CustomerColumnDef;
}

function getPrimaryContact(customer: Customer): string {
  const primaryContact = customer.contacts?.[0];

  return (
    primaryContact?.email ??
    customer.email ??
    primaryContact?.phone ??
    customer.contacts?.[0]?.name ??
    "-"
  );
}

export default function CustomerGroupPage() {
  const { t, i18n } = useT();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const tenantContext = useTenantContext();
  const { unlinkCustomerFromCustomerGroup } = useCustomers();
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showRemoveMemberDialog, setShowRemoveMemberDialog] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const borderColor = "gray.muted";
  const columnHelper = createColumnHelper<Customer>();
  const {
    data: customerGroup,
    isLoading: isLoadingCustomerGroup,
    mutate: mutateCustomerGroup,
  } = useSWR(
    id ? ["/customerGroups/detail", id, tenantContext] : null,
    ([, customerGroupId, context]) =>
      fetchCustomerGroup(customerGroupId, context),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );
  const customerIds = useMemo(
    () => customerGroup?.customerIds ?? [],
    [customerGroup?.customerIds],
  );
  const {
    data: members,
    isLoading: isLoadingMembers,
    mutate: mutateMembers,
  } = useSWR(
    customerGroup
      ? ["/customerGroups/detail/members", customerIds, tenantContext]
      : null,
    ([, memberIds, context]) => fetchCustomerGroupMembers(memberIds, context),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );

  function handleUpdateFormOpen() {
    startTransition(() => {
      setShowUpdateForm(true);
    });
  }

  function handleArchive() {
    startTransition(() => {
      setShowArchiveDialog(true);
    });
  }

  function handleRemoveMember(customer: Customer) {
    startTransition(() => {
      setCurrentCustomer(customer);
      setShowRemoveMemberDialog(true);
    });
  }

  const archiveCustomerGroup = async () => {
    if (!customerGroup) {
      return;
    }

    try {
      const archivedAt = Timestamp.now();
      await update(
        {
          active: false,
          archivedAt,
          updatedAt: archivedAt,
        },
        db.doc<Record<string, unknown>>(
          firestore,
          "/customerGroups",
          customerGroup.id,
        ),
        tenantContext,
      );
      setShowArchiveDialog(false);
      toaster.success({
        title: t("customerGroups.archived", {
          defaultValue: "Customer group archived",
        }),
        description: t("customerGroups.archivedDescription", {
          defaultValue: "{{name}} is no longer available for new assignments.",
          name: customerGroup.name,
        }),
      });
      router.push("/customers/groups" as Route);
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("errors.somethingWentWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("customerGroups.notArchived", {
          defaultValue: "Customer group could not be archived.",
        }),
      });
    }
  };

  const removeMember = async () => {
    if (!customerGroup || !currentCustomer) {
      return;
    }

    try {
      await unlinkCustomerFromCustomerGroup(
        currentCustomer.id,
        customerGroup.id,
      );
      setShowRemoveMemberDialog(false);
      toaster.success({
        title: t("customerGroups.memberRemoved", {
          defaultValue: "Customer removed from group",
        }),
        description: t("customerGroups.memberRemovedDescription", {
          defaultValue: "{{name}} is no longer assigned to {{group}}.",
          name: currentCustomer.name,
          group: customerGroup.name,
        }),
      });
      await mutateCustomerGroup();
      await mutateMembers();
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("errors.somethingWentWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("customerGroups.memberRemoveFailed", {
          defaultValue: "Customer could not be removed from this group.",
        }),
      });
    }
  };

  const columns = useMemo<CustomerColumnDef[]>(
    () => [
      asCustomerColumnDef(
        columnHelper.accessor("name", {
          cell: (info) => info.getValue() || "-",
          header: t("admin.company", { defaultValue: "Company" }),
        }),
      ),
      asCustomerColumnDef(
        columnHelper.accessor("personName", {
          cell: (info) => info.getValue() || "-",
          header: t("admin.person", { defaultValue: "Person" }),
        }),
      ),
      columnHelper.display({
        id: "contact",
        cell: (props) => getPrimaryContact(props.row.original),
        header: t("forms.labels.contact", { defaultValue: "Contact" }),
      }),
      columnHelper.display({
        id: "customerGroups",
        cell: (props) => props.row.original.customerGroupIds?.length ?? 0,
        header: t("forms.labels.customerGroups", {
          defaultValue: "Customer groups",
        }),
      }),
      columnHelper.display({
        id: "actions",
        cell: (props) => (
          <HStack justify="end">
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/customers/${props.row.original.id}`}
              icon="open_in_new"
              ariaLabel={t("admin.customerPreview", {
                defaultValue: "Customer preview",
              })}
              tooltipLabel={t("admin.customerPreview", {
                defaultValue: "Customer preview",
              })}
            />
            <Button
              size="sm"
              variant="ghost"
              color="fg.error"
              onClick={() => handleRemoveMember(props.row.original)}
            >
              <MaterialSymbol>group_remove</MaterialSymbol>
              {t("customerGroups.removeMember", {
                defaultValue: "Remove",
              })}
            </Button>
          </HStack>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    [columnHelper, i18n.resolvedLanguage, t],
  );

  if (!isLoadingCustomerGroup && !customerGroup) {
    return (
      <>
        <CustomHeading
          heading={t("customerGroups.notFoundTitle", {
            defaultValue: "Customer group not found",
          })}
          mb="8"
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <Empty
          title={t("customerGroups.notFoundTitle", {
            defaultValue: "Customer group not found",
          })}
          description={t("customerGroups.notFoundDescription", {
            defaultValue:
              "This group may have been archived, deleted, or may not belong to the current tenant.",
          })}
          icon="groups"
        />
        <ButtonLink
          mt="6"
          href="/customers/groups"
          lng={i18n.resolvedLanguage}
          ariaLabel={t("customerGroups.backToGroups", {
            defaultValue: "Back to customer groups",
          })}
          variant="outline"
        >
          <MaterialSymbol>arrow_back</MaterialSymbol>
          {t("customerGroups.backToGroups", {
            defaultValue: "Back to customer groups",
          })}
        </ButtonLink>
      </>
    );
  }

  return (
    <Skeleton loading={isLoadingCustomerGroup}>
      <Grid
        minW="100%"
        templateColumns={["repeat(1, 1fr)", "repeat(5, 1fr)"]}
        columnGap={["0", "8"]}
        rowGap={["6", "8"]}
      >
        <GridItem colSpan={[1, 5]}>
          <Flex align="flex-start" gap="4" justify="space-between" wrap="wrap">
            <CustomHeading
              heading={customerGroup?.name ?? ""}
              mb="0"
              breadcrumb={true}
              goBack={true}
              t={t}
            />
            <HStack align="center" gap="2" flexShrink={0}>
              <Button
                onClick={handleUpdateFormOpen}
                variant="solid"
                colorPalette="primary"
                size="sm"
              >
                <MaterialSymbol>edit</MaterialSymbol>
                {t("customerGroups.edit", {
                  defaultValue: "Edit customer group",
                })}
              </Button>
              <IconButton
                aria-label={t("customerGroups.archive", {
                  defaultValue: "Archive customer group",
                })}
                size="sm"
                variant="outline"
                color="fg.error"
                onClick={handleArchive}
              >
                <MaterialSymbol>archive</MaterialSymbol>
              </IconButton>
            </HStack>
          </Flex>
        </GridItem>
        <GridItem colSpan={[1, 3]} overflowX="auto">
          <Box
            mb={["6", "8"]}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="3xl"
            p="8"
          >
            <HStack justify="space-between" align="center" mb="6" gap="4">
              <HStack gap="3" align="center" flexWrap="wrap">
                <Heading size="md">
                  {t("customerGroups.members", { defaultValue: "Members" })}
                </Heading>
                <Text color="fg.muted">
                  {t("customerGroups.memberCount", {
                    defaultValue: "Members: {{count}}",
                    count: customerGroup?.customerIds?.length ?? 0,
                  })}
                </Text>
              </HStack>
            </HStack>
            <Skeleton loading={isLoadingMembers}>
              {members && members.length > 0 ? (
                <DataTable
                  columns={columns}
                  data={members}
                  paginationType="uncontrolled"
                  loading={isLoadingMembers}
                  t={t}
                  i18n={i18n}
                />
              ) : (
                <Empty
                  title={t("customerGroups.noMembersTitle", {
                    defaultValue: "No members",
                  })}
                  description={t("customerGroups.noMembersDescription", {
                    defaultValue:
                      "Customers assigned to this group will appear here.",
                  })}
                  icon="groups"
                />
              )}
            </Skeleton>
          </Box>
        </GridItem>
        <GridItem minW="100%" colSpan={[1, 2]}>
          <Box
            border="1px solid"
            borderColor={borderColor}
            borderRadius="3xl"
            p="8"
          >
            <HStack justify="space-between" align="center" gap="4">
              <Heading size="md">
                {t("customerGroups.details", { defaultValue: "Details" })}
              </Heading>
            </HStack>
            <Separator my="6" />
            <Stack gap="4">
              <Box>
                <Text color="fg.muted" fontSize="sm">
                  {t("forms.labels.name", { defaultValue: "Name" })}
                </Text>
                <Text>{customerGroup?.name}</Text>
              </Box>
              <Box>
                <Text color="fg.muted" fontSize="sm">
                  {t("forms.labels.description", {
                    defaultValue: "Description",
                  })}
                </Text>
                <Text>{customerGroup?.description || "-"}</Text>
              </Box>
              <Flex gap="6" wrap="wrap">
                <Box>
                  <Text color="fg.muted" fontSize="sm">
                    {t("customers.dateAdded", { defaultValue: "Date added" })}
                  </Text>
                  <Text>
                    {customerGroup?.createdAt
                      ? formatDate(
                          customerGroup.createdAt,
                          i18n.resolvedLanguage,
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                          },
                        )
                      : "-"}
                  </Text>
                </Box>
                <Box>
                  <Text color="fg.muted" fontSize="sm">
                    {t("customerGroups.updatedAt", {
                      defaultValue: "Updated",
                    })}
                  </Text>
                  <Text>
                    {customerGroup?.updatedAt
                      ? formatDate(
                          customerGroup.updatedAt,
                          i18n.resolvedLanguage,
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                          },
                        )
                      : "-"}
                  </Text>
                </Box>
              </Flex>
              <Box>
                <Text color="fg.muted" fontSize="sm">
                  {t("customerGroups.updatedBy", {
                    defaultValue: "Updated by",
                  })}
                </Text>
                <Text>{customerGroup?.updatedBy?.name || "-"}</Text>
              </Box>
            </Stack>
          </Box>
        </GridItem>
      </Grid>
      <CustomerGroupForm
        customerGroup={customerGroup}
        type="UPDATE"
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
        onSuccess={() => {
          setShowUpdateForm(false);
          void mutateCustomerGroup();
        }}
      />
      <AlertDialog
        header={t("customerGroups.confirmArchive", {
          defaultValue: "Archive customer group?",
        })}
        handle={() => {
          void archiveCustomerGroup();
        }}
        open={showArchiveDialog}
        setOpen={setShowArchiveDialog}
        t={t}
      >
        <Text>
          {t("customerGroups.archiveDescription", {
            defaultValue:
              "Archived groups stay on existing customers but are hidden from new assignments and promotion targeting options.",
          })}
        </Text>
      </AlertDialog>
      <AlertDialog
        header={t("customerGroups.confirmRemoveMember", {
          defaultValue: "Remove customer from group?",
        })}
        handle={() => {
          void removeMember();
        }}
        open={showRemoveMemberDialog}
        setOpen={setShowRemoveMemberDialog}
        t={t}
      >
        <Text>
          {t("customerGroups.removeMemberDescription", {
            defaultValue:
              "This customer will no longer belong to the current group.",
          })}
        </Text>
      </AlertDialog>
    </Skeleton>
  );
}
