"use client";

import {
  listTenantSwitcherOptions,
  switchTenantContextAction,
  type TenantSwitcherOption,
} from "@/actions";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  Box,
  createListCollection,
  HStack,
  Portal,
  Select,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { toaster } from "@konfi/components/ui/toaster";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

const currentChannelStorageKey = "channel";
const defaultComputerChannelStorageKey = "defaultComputerChannel";

function tenantRoleLabel(role: string, t: ReturnType<typeof useT>["t"]) {
  const normalizedRole = role.toUpperCase();

  if (normalizedRole === "OWNER") {
    return t("tenantSwitcher.roles.owner", { defaultValue: "Owner" });
  }

  if (normalizedRole === "ADMIN") {
    return t("tenantSwitcher.roles.admin", { defaultValue: "Admin" });
  }

  return t("tenantSwitcher.roles.member", { defaultValue: "Member" });
}

export default function TenantSwitcher() {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const tenantContext = useTenantContext();
  const [tenants, setTenants] = useState<TenantSwitcherOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState<string[]>(() =>
    tenantContext.tenantId ? [tenantContext.tenantId] : [],
  );
  const [isPending, startTransition] = useTransition();

  const isSaasRuntime =
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId;

  useEffect(() => {
    if (!isSaasRuntime) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    listTenantSwitcherOptions()
      .then((options) => {
        if (cancelled) {
          return;
        }

        setTenants(options);
      })
      .catch((error) => {
        console.error(error);
        toaster.create({
          title: t("tenantSwitcher.loadFailed", {
            defaultValue: "Failed to load workspaces",
          }),
          type: "error",
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSaasRuntime, t]);

  useEffect(() => {
    setValue(tenantContext.tenantId ? [tenantContext.tenantId] : []);
  }, [tenantContext.tenantId]);

  const collection = useMemo(
    () =>
      createListCollection({
        items: tenants.map((tenant) => ({
          ...tenant,
          label: tenant.name,
          value: tenant.id,
        })),
      }),
    [tenants],
  );

  if (!isSaasRuntime || tenants.length <= 1) {
    return null;
  }

  const switchTenant = (nextTenantId: string | undefined) => {
    if (!nextTenantId || nextTenantId === tenantContext.tenantId) {
      return;
    }

    setValue([nextTenantId]);
    startTransition(async () => {
      try {
        await switchTenantContextAction(nextTenantId);
        localStorage.removeItem(currentChannelStorageKey);
        localStorage.removeItem(defaultComputerChannelStorageKey);
        router.refresh();
        router.replace(pathname as Route);
      } catch (error) {
        console.error(error);
        setValue(tenantContext.tenantId ? [tenantContext.tenantId] : []);
        toaster.create({
          title: t("tenantSwitcher.switchFailed", {
            defaultValue: "Failed to switch workspace",
          }),
          type: "error",
        });
      }
    });
  };

  return (
    <Box>
      <Select.Root
        collection={collection}
        disabled={loading || isPending}
        onValueChange={({ value: nextValue }) => switchTenant(nextValue[0])}
        positioning={{ sameWidth: true, placement: "top" }}
        size="sm"
        value={value}
      >
        <Select.HiddenSelect />
        <Select.Control>
          <Select.Trigger>
            <Select.ValueText
              placeholder={t("tenantSwitcher.placeholder", {
                defaultValue: "Workspace",
              })}
            />
          </Select.Trigger>
          <Select.IndicatorGroup>
            {(loading || isPending) && (
              <Spinner size="xs" borderWidth="1.5px" color="fg.muted" />
            )}
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              {collection.items.map((tenant) => (
                <Select.Item item={tenant} key={tenant.value}>
                  <HStack minW={0} gap={2}>
                    <MaterialSymbol>domain</MaterialSymbol>
                    <Box minW={0}>
                      <Select.ItemText>{tenant.label}</Select.ItemText>
                      <Text color="fg.muted" fontSize="xs" truncate>
                        {tenantRoleLabel(tenant.role, t)}
                      </Text>
                    </Box>
                  </HStack>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>
    </Box>
  );
}
