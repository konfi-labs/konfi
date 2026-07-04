"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import { useTenantContext } from "@/context/tenant";
import {
  Button,
  Flex,
  Separator,
  Skeleton,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  AlertDialog,
  CustomHeading,
  DataTable,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
} from "@konfi/components";
import { db, get, remove, tenant } from "@konfi/firebase";
import { DesignatedPickupArea } from "@konfi/types";
import { createColumnHelper } from "@tanstack/react-table";
import { where } from "firebase/firestore";
import dynamic from "next/dynamic";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

const DesignatedPickupAreaForm = dynamic(
  () => import("./DesignatedPickupAreaForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

interface DesignatedPickupAreasManagerProps {
  warehouseId: string;
  warehouseName?: string;
}

const DesignatedPickupAreasManager = ({
  warehouseId,
  warehouseName,
}: DesignatedPickupAreasManagerProps) => {
  const { t, i18n } = useT();
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [pickupAreas, setPickupAreas] = useState<DesignatedPickupArea[]>([]);
  const [loading, setLoading] = useState(true);
  const columHelper = createColumnHelper<DesignatedPickupArea>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tenantContext = useTenantContext();

  const data = useMemo<DesignatedPickupArea[]>(
    () =>
      filterLocalFuseItems(pickupAreas, searchKey ?? "", {
        keys: [
          { name: "name", weight: 0.55 },
          { name: "description", weight: 0.25 },
          {
            getFn: (pickupArea) => pickupArea.shippingOptions ?? [],
            name: "shippingOptions",
            weight: 0.2,
          },
        ],
        threshold: 0.36,
      }),
    [pickupAreas, searchKey],
  );

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [currentPickupArea, setCurrentPickupArea] =
    useState<DesignatedPickupArea | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  // Fetch pickup areas for this warehouse
  const fetchPickupAreas = async () => {
    try {
      setLoading(true);
      const query = db.query<DesignatedPickupArea>(
        firestore,
        "designatedPickupAreas",
        99,
        undefined,
        [
          ...tenant.queryConstraints(tenantContext),
          where("warehouseId", "==", warehouseId),
          where("active", "==", true),
        ],
      );
      const result = await get<DesignatedPickupArea>(query);
      const areas = result ? result[0] : [];
      setPickupAreas(Array.isArray(areas) ? areas : []);
    } catch (error) {
      console.error("Error fetching pickup areas:", error);
      setPickupAreas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (warehouseId) {
      fetchPickupAreas();
    }
  }, [tenantContext, warehouseId]);

  function handleCreateFormOpen() {
    startTransition(() => {
      setShowCreateForm(true);
    });
  }

  function handleUpdateFormOpen(pickupArea: DesignatedPickupArea) {
    startTransition(() => {
      setCurrentPickupArea(pickupArea);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(pickupArea: DesignatedPickupArea) {
    startTransition(() => {
      setCurrentPickupArea(pickupArea);
      setShowDuplicateForm(true);
    });
  }

  function handleRemove(pickupArea: DesignatedPickupArea) {
    startTransition(() => {
      setCurrentPickupArea(pickupArea);
      setShowRemoveDialog(true);
    });
  }

  const removePickupArea = async (pickupAreaId: string) => {
    try {
      await remove(db.doc(firestore, "/designatedPickupAreas", pickupAreaId));
      await fetchPickupAreas(); // Refresh the list
    } catch (error) {
      console.error("Error removing pickup area:", error);
    }
  };

  const columns = useMemo(
    () => [
      columHelper.accessor("name", {
        cell: (info) => info.getValue(),
        header: t("common.name"),
      }),
      columHelper.accessor("description", {
        cell: (info) => info.getValue() || "-",
        header: t("common.description"),
      }),
      columHelper.accessor("shippingOptions", {
        cell: (info) => {
          const options = info.getValue();
          return options && options.length > 0
            ? options.join(", ")
            : t("common.all", { defaultValue: "All" });
        },
        header: t("forms.labels.supportedShippingOptions", {
          defaultValue: "Supported Shipping Options",
        }),
      }),
      columHelper.accessor("createdAt", {
        cell: (info) =>
          info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
        header: t("common.dateAdded"),
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Menu
            icon={<MaterialSymbol>menu_open</MaterialSymbol>}
            ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            disablePortal={true}
          >
            <MenuItem
              value={"update-form"}
              onClick={() => handleUpdateFormOpen(props.row.original)}
            >
              <MaterialSymbol>edit_square</MaterialSymbol>
              {t("admin.editPickupArea", { defaultValue: "Edit Pickup Area" })}
            </MenuItem>
            <MenuItem
              value={"duplicate-form"}
              onClick={() => handleDuplicateFormOpen(props.row.original)}
            >
              <MaterialSymbol>content_copy</MaterialSymbol>
              {t("admin.copyPickupArea", { defaultValue: "Copy Pickup Area" })}
            </MenuItem>
            <MenuItem
              value={"deactivate-modal"}
              onClick={() => handleRemove(props.row.original)}
              color="fg.error"
              _hover={{ bg: "bg.error", color: "fg.error" }}
            >
              <MaterialSymbol>delete</MaterialSymbol>
              {t("admin.removePickupArea", {
                defaultValue: "Remove Pickup Area",
              })}
            </MenuItem>
          </Menu>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    [data, t, i18n.resolvedLanguage],
  );

  if (!warehouseId) {
    return (
      <VStack align="start" gap={4}>
        <Text color="fg.muted">
          {t("admin.saveWarehouseToManagePickupAreas", {
            defaultValue: "Save the warehouse first to manage pickup areas.",
          })}
        </Text>
      </VStack>
    );
  }

  return (
    <VStack align="start" gap={4} w="full">
      <CustomHeading
        heading={t("admin.designatedPickupAreas", {
          defaultValue: "Designated Pickup Areas",
        })}
        size="md"
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      <Flex w="full">
        <SearchInput
          placeholder={t("admin.searchPickupAreaByName", {
            defaultValue: "Search pickup area by name...",
          })}
          searchFn={undefined}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          t={t}
        />
        <Spacer />
        <RefreshButton
          label={t("common.refresh")}
          refreshFunction={fetchPickupAreas}
        />
        <Button
          onClick={() => handleCreateFormOpen()}
          ml={"2"}
          variant={"ghost"}
          colorPalette={"primary"}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("common.add")}{" "}
          {t("admin.pickupArea", { defaultValue: "Pickup Area" })}
        </Button>
      </Flex>

      <Separator />

      {loading ? (
        <VStack align="stretch" gap={3}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} h="12" borderRadius="xl" />
          ))}
        </VStack>
      ) : data && data.length > 0 ? (
        <DataTable
          columns={columns}
          data={data}
          paginationType={"uncontrolled"}
          t={t}
          i18n={i18n}
        />
      ) : (
        <Text color="fg.muted">
          {t("admin.noPickupAreasForWarehouse", {
            defaultValue: "No pickup areas defined for this warehouse.",
          })}
        </Text>
      )}

      <DesignatedPickupAreaForm
        warehouseId={warehouseId}
        type={"CREATE"}
        open={showCreateForm}
        setOpen={setShowCreateForm}
      />
      <DesignatedPickupAreaForm
        pickupArea={currentPickupArea!}
        warehouseId={warehouseId}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
      />
      <DesignatedPickupAreaForm
        pickupArea={currentPickupArea!}
        warehouseId={warehouseId}
        type={"DUPLICATE"}
        open={showDuplicateForm}
        setOpen={setShowDuplicateForm}
      />
      <AlertDialog
        header={t("admin.confirmRemovePickupArea", {
          defaultValue: "Confirm Remove Pickup Area",
        })}
        handle={() => removePickupArea(currentPickupArea!.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>
          {t("admin.removePickupAreaDescription", {
            defaultValue:
              "Are you sure you want to remove this pickup area? This action cannot be undone.",
          })}
        </Text>
      </AlertDialog>
    </VStack>
  );
};

export default DesignatedPickupAreasManager;
