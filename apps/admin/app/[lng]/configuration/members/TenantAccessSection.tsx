"use client";

import {
  listTenantMembershipAccessAction,
  saveTenantMembershipAccessAction,
  type TenantMembershipAccessRecord,
} from "@/actions/tenant-permissions";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  Field,
  Fieldset,
  Flex,
  Grid,
  Heading,
  Input,
  Portal,
  Select,
  Separator,
  Stack,
  Text,
  createListCollection,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import {
  TENANT_PERMISSION_GROUPS,
  type TenantPermission,
  TenantMembershipStatus,
  TenantRole,
} from "@sblyvwx/cloud-contracts";
import { useAuth } from "context/auth";
import { useChannels } from "context/channels";
import { useCallback, useEffect, useMemo, useState } from "react";

const roles = [
  TenantRole.OWNER,
  TenantRole.ADMIN,
  TenantRole.MEMBER,
  TenantRole.COURIER,
] as const;

const statuses = [
  TenantMembershipStatus.ACTIVE,
  TenantMembershipStatus.INVITED,
  TenantMembershipStatus.DISABLED,
] as const;

interface AccessFormState {
  channelIds: string[];
  email: string;
  permissions: TenantPermission[];
  role: TenantRole;
  status: TenantMembershipStatus;
  uid: string;
}

const emptyFormState = (): AccessFormState => ({
  channelIds: [],
  email: "",
  permissions: [],
  role: TenantRole.ADMIN,
  status: TenantMembershipStatus.ACTIVE,
  uid: "",
});

function permissionLabelKey(permission: TenantPermission) {
  return `tenantAccess.permissions.${permission.replaceAll(".", "_")}`;
}

export default function TenantAccessSection() {
  const { t } = useT();
  const { tenantAccess, isSuperAdminClient } = useAuth();
  const { channels } = useChannels();
  const [records, setRecords] = useState<TenantMembershipAccessRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccessFormState>(() => emptyFormState());

  const canManage = Boolean(
    isSuperAdminClient || tenantAccess?.canManageTenantAccess,
  );
  const isOwnerRole = form.role === TenantRole.OWNER;

  const roleCollection = useMemo(
    () =>
      createListCollection({
        items: roles.map((role) => ({
          label: t(`tenantAccess.roles.${role}`, { defaultValue: role }),
          value: role,
        })),
      }),
    [t],
  );

  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: statuses.map((status) => ({
          label: t(`tenantAccess.statuses.${status}`, {
            defaultValue: status,
          }),
          value: status,
        })),
      }),
    [t],
  );

  const loadRecords = useCallback(async () => {
    if (!canManage) {
      return;
    }

    setLoading(true);
    try {
      setRecords(await listTenantMembershipAccessAction());
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("tenantAccess.toasts.loadFailed", {
          defaultValue: "Access records could not be loaded",
        }),
      });
    } finally {
      setLoading(false);
    }
  }, [canManage, t]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  function editRecord(record: TenantMembershipAccessRecord) {
    setForm({
      channelIds: record.channelIds,
      email: record.email ?? "",
      permissions: record.permissions ?? [],
      role: record.role,
      status: record.status,
      uid: record.uid,
    });
  }

  async function saveAccess() {
    setSaving(true);
    try {
      const record = await saveTenantMembershipAccessAction(form);
      setRecords((current) => [
        record,
        ...current.filter((item) => item.id !== record.id),
      ]);
      setForm(emptyFormState());
      toaster.success({
        title: t("tenantAccess.toasts.saved", {
          defaultValue: "Access updated",
        }),
      });
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("tenantAccess.toasts.saveFailed", {
          defaultValue: "Access could not be updated",
        }),
        description:
          error instanceof Error
            ? error.message
            : t("errors.somethingWentWrong"),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <Box mt="10">
        <Heading size="md">
          {t("tenantAccess.title", { defaultValue: "Access" })}
        </Heading>
        <Text color="fg.muted" mt="2">
          {t("tenantAccess.ownerOnly", {
            defaultValue:
              "Only tenant owners and super admins can manage tenant access.",
          })}
        </Text>
      </Box>
    );
  }

  return (
    <Box mt="10">
      <Flex align="center" gap="3" wrap="wrap">
        <Heading size="md">
          {t("tenantAccess.title", { defaultValue: "Access" })}
        </Heading>
        <Badge colorPalette="blue" variant="subtle">
          {t("tenantAccess.badge", { defaultValue: "Tenant memberships" })}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void loadRecords()}
          loading={loading}
        >
          <MaterialSymbol>refresh</MaterialSymbol>
          {t("common.refresh", { defaultValue: "Refresh" })}
        </Button>
      </Flex>
      <Text color="fg.muted" mt="2">
        {t("tenantAccess.description", {
          defaultValue:
            "Control which signed-in admin accounts can write catalog and configuration data for this tenant.",
        })}
      </Text>
      <Separator my="5" />
      <Grid
        gap="6"
        templateColumns={{ base: "1fr", xl: "minmax(0, 1fr) 420px" }}
      >
        <Stack gap="3">
          {records.map((record) => (
            <Box
              borderColor="border"
              borderWidth="1px"
              key={record.id}
              p="4"
              rounded="md"
            >
              <Flex align="flex-start" gap="4" justify="space-between">
                <Box minW="0">
                  <Text fontWeight="medium">
                    {record.email ?? record.displayName ?? record.uid}
                  </Text>
                  <Text color="fg.muted" textStyle="sm">
                    {record.uid}
                  </Text>
                </Box>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => editRecord(record)}
                >
                  <MaterialSymbol>edit_square</MaterialSymbol>
                  {t("common.edit", { defaultValue: "Edit" })}
                </Button>
              </Flex>
              <Flex gap="2" mt="3" wrap="wrap">
                <Badge variant="surface">
                  {t(`tenantAccess.roles.${record.role}`, {
                    defaultValue: record.role,
                  })}
                </Badge>
                <Badge
                  colorPalette={
                    record.status === TenantMembershipStatus.ACTIVE
                      ? "success"
                      : "gray"
                  }
                  variant="surface"
                >
                  {t(`tenantAccess.statuses.${record.status}`, {
                    defaultValue: record.status,
                  })}
                </Badge>
                <Badge variant="outline">
                  {record.permissions
                    ? t("tenantAccess.explicitPermissions", {
                        count: record.permissions.length,
                        defaultValue: "{{count}} permissions",
                      })
                    : t("tenantAccess.legacyAccess", {
                        defaultValue: "Legacy full access",
                      })}
                </Badge>
                <Badge variant="outline">
                  {record.role === TenantRole.OWNER ||
                  record.channelIds.length === 0
                    ? t("tenantAccess.allChannels", {
                        defaultValue: "All channels",
                      })
                    : t("tenantAccess.limitedChannels", {
                        count: record.channelIds.length,
                        defaultValue: "{{count}} channels",
                      })}
                </Badge>
              </Flex>
            </Box>
          ))}
        </Stack>
        <Stack gap="4">
          <Heading size="sm">
            {form.uid
              ? t("tenantAccess.editTitle", { defaultValue: "Edit access" })
              : t("tenantAccess.createTitle", { defaultValue: "Add access" })}
          </Heading>
          <Field.Root>
            <Field.Label>
              {t("tenantAccess.email", { defaultValue: "Email" })}
            </Field.Label>
            <Input
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>
              {t("tenantAccess.uid", { defaultValue: "User ID" })}
            </Field.Label>
            <Input
              value={form.uid}
              onChange={(event) =>
                setForm((current) => ({ ...current, uid: event.target.value }))
              }
            />
          </Field.Root>
          <Select.Root
            collection={roleCollection}
            value={[form.role]}
            onValueChange={({ value }) =>
              setForm((current) => ({
                ...current,
                role: (value[0] as TenantRole | undefined) ?? current.role,
                channelIds:
                  value[0] === TenantRole.OWNER ? [] : current.channelIds,
              }))
            }
          >
            <Select.HiddenSelect />
            <Select.Label>
              {t("tenantAccess.role", { defaultValue: "Role" })}
            </Select.Label>
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content>
                  {roleCollection.items.map((item) => (
                    <Select.Item item={item} key={item.value}>
                      {item.label}
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
          <Select.Root
            collection={statusCollection}
            value={[form.status]}
            onValueChange={({ value }) =>
              setForm((current) => ({
                ...current,
                status:
                  (value[0] as TenantMembershipStatus | undefined) ??
                  current.status,
              }))
            }
          >
            <Select.HiddenSelect />
            <Select.Label>
              {t("tenantAccess.status", { defaultValue: "Status" })}
            </Select.Label>
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content>
                  {statusCollection.items.map((item) => (
                    <Select.Item item={item} key={item.value}>
                      {item.label}
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
          <Fieldset.Root>
            <Fieldset.Legend>
              {t("tenantAccess.channels", { defaultValue: "Channels" })}
            </Fieldset.Legend>
            <Fieldset.HelperText>
              {isOwnerRole
                ? t("tenantAccess.ownerAllChannels", {
                    defaultValue: "Owners always have full tenant access.",
                  })
                : t("tenantAccess.channelsHelp", {
                    defaultValue:
                      "Leave empty to allow all channels, or select specific channels to limit access.",
                  })}
            </Fieldset.HelperText>
            <CheckboxGroup
              disabled={isOwnerRole}
              value={form.channelIds}
              onValueChange={(channelIds) =>
                setForm((current) => ({ ...current, channelIds }))
              }
            >
              <Fieldset.Content>
                {(channels ?? []).map((channel) => (
                  <Checkbox.Root key={channel.id} value={channel.id}>
                    <Checkbox.HiddenInput />
                    <Checkbox.Control />
                    <Checkbox.Label>{channel.name}</Checkbox.Label>
                  </Checkbox.Root>
                ))}
              </Fieldset.Content>
            </CheckboxGroup>
          </Fieldset.Root>
          <Fieldset.Root>
            <Fieldset.Legend>
              {t("tenantAccess.permissionsTitle", {
                defaultValue: "Permissions",
              })}
            </Fieldset.Legend>
            <CheckboxGroup
              value={form.permissions}
              onValueChange={(permissions) =>
                setForm((current) => ({
                  ...current,
                  permissions: permissions.filter(
                    (permission): permission is TenantPermission =>
                      typeof permission === "string",
                  ),
                }))
              }
            >
              <Stack gap="4">
                {TENANT_PERMISSION_GROUPS.map((group) => (
                  <Stack gap="2" key={group.id}>
                    <Text fontWeight="medium" textStyle="sm">
                      {t(`tenantAccess.groups.${group.id}`, {
                        defaultValue: group.id,
                      })}
                    </Text>
                    <Fieldset.Content>
                      {group.permissions.map((permission) => (
                        <Checkbox.Root key={permission} value={permission}>
                          <Checkbox.HiddenInput />
                          <Checkbox.Control />
                          <Checkbox.Label>
                            {t(permissionLabelKey(permission), {
                              defaultValue: permission,
                            })}
                          </Checkbox.Label>
                        </Checkbox.Root>
                      ))}
                    </Fieldset.Content>
                  </Stack>
                ))}
              </Stack>
            </CheckboxGroup>
          </Fieldset.Root>
          <Flex gap="3">
            <Button
              colorPalette="primary"
              loading={saving}
              onClick={() => void saveAccess()}
            >
              <MaterialSymbol>save</MaterialSymbol>
              {t("common.save", { defaultValue: "Save" })}
            </Button>
            <Button variant="outline" onClick={() => setForm(emptyFormState())}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
          </Flex>
        </Stack>
      </Grid>
    </Box>
  );
}
