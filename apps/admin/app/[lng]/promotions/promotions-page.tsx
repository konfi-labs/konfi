"use client";

import Menu from "@/components/Menu";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useT } from "@/i18n/client";
import { Flex, Heading, Separator, Spacer, Text } from "@chakra-ui/react";
import {
  AlertDialog,
  ButtonLink,
  CustomHeading,
  DataTable,
  Empty,
  IconButtonLink,
  MaterialSymbol,
  MenuItem,
  MenuItemLink,
  RefreshButton,
} from "@konfi/components";
import { Campaign, Promotion } from "@konfi/types";
import {
  ADMIN_CAMPAIGNS_CREATE,
  ADMIN_CAMPAIGNS_UPDATE,
  ADMIN_PROMOTIONS_CREATE,
  ADMIN_PROMOTIONS_UPDATE,
} from "@konfi/utils";
import { createColumnHelper } from "@tanstack/react-table";
import { usePromotions } from "context/promotions";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

export default function PromotionsPage() {
  const { t, i18n } = useT();
  const {
    loadingPromotions,
    promotions,
    refreshPromotions,
    deactivatePromotion,
    removePromotion,
    loadingCampaigns,
    campaigns,
    refreshCampaigns,
    removeCampaign,
  } = usePromotions();
  const columHelperPromotions = createColumnHelper<Promotion>();
  const columHelperCampaigns = createColumnHelper<Campaign>();
  const promotionsData = promotions;
  const campaignsData = campaigns;
  const router = useRouter();
  const [currentPromotion, setCurrentPromotion] = useState<Promotion | null>(
    null,
  );
  const [currentCampaign, setCurrentCampaign] = useState<Campaign | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showRemoveCampaignDialog, setShowRemoveCampaignDialog] =
    useState(false);

  function handleRemove(promotion: Promotion) {
    startTransition(() => {
      setCurrentPromotion(promotion);
      setShowRemoveDialog(true);
    });
  }

  function handleDeactivate(promotion: Promotion) {
    startTransition(() => {
      setCurrentPromotion(promotion);
      setShowDeactivateDialog(true);
    });
  }

  function handleRemoveCampaign(campaign: Campaign) {
    startTransition(() => {
      setCurrentCampaign(campaign);
      setShowRemoveCampaignDialog(true);
    });
  }

  const columnsPromotions = useMemo(
    () => [
      columHelperPromotions.accessor("code", {
        cell: (info) => info.getValue(),
        header: t("table.code", { defaultValue: "Code" }),
      }),
      columHelperPromotions.accessor("applicationMethod", {
        cell: (info) => {
          const method = info.getValue();
          if (!method) return "";
          return method.type === "FIXED"
            ? `${method.value ?? 0} ${method.currencyCode ?? ""}`
            : `${method.value ?? 0}%`;
        },
        header: t("table.value", { defaultValue: "Value" }),
      }),
      columHelperPromotions.accessor("active", {
        cell: (info) =>
          info.getValue()
            ? t("active", { defaultValue: "Active" })
            : t("inactive", { defaultValue: "Inactive" }),
        header: t("common.status", { defaultValue: "Status" }),
      }),
      columHelperPromotions.display({
        id: "actions",
        cell: (props) => (
          <Flex justify={"end"} gap={"1"} onClick={(e) => e.stopPropagation()}>
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/promotions/${props.row.original.id}`}
              icon={"open_in_new"}
              ariaLabel={t("admin.promotionPreview", {
                defaultValue: "Open promotion details",
              })}
              tooltipLabel={t("admin.promotionPreview", {
                defaultValue: "Open promotion details",
              })}
            />
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItemLink
                lng={i18n.resolvedLanguage}
                href={ADMIN_PROMOTIONS_UPDATE(props.row.original.id)}
                value={"edit"}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("common.edit", { defaultValue: "Edit" })}
              </MenuItemLink>
              <MenuItem
                value={"deactivate-modal"}
                onClick={() => handleDeactivate(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.deactivatePromotion", {
                  defaultValue: "Deactivate promotion",
                })}
              </MenuItem>
              <MenuItem
                value={"remove-modal"}
                onClick={() => handleRemove(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.removePromotion", {
                  defaultValue: "Delete promotion",
                })}
              </MenuItem>
            </Menu>
          </Flex>
        ),
        meta: {
          isNumeric: true,
        },
        header: t("table.actions", { defaultValue: "Actions" }),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [promotionsData],
  );

  const columnsCampaigns = useMemo(
    () => [
      columHelperCampaigns.accessor("name", {
        cell: (info) => info.getValue(),
        header: t("table.name", { defaultValue: "Name" }),
      }),
      columHelperCampaigns.accessor("description", {
        cell: (info) => info.getValue(),
        header: t("table.description", { defaultValue: "Description" }),
      }),
      columHelperCampaigns.accessor("startsAt", {
        cell: (info) => {
          const value = info.getValue();
          return value
            ? new Date(value).toLocaleDateString(i18n.resolvedLanguage)
            : "";
        },
        header: t("common.startDate", { defaultValue: "Start date" }),
      }),
      columHelperCampaigns.accessor("endsAt", {
        cell: (info) => {
          const value = info.getValue();
          return value
            ? new Date(value).toLocaleDateString(i18n.resolvedLanguage)
            : "";
        },
        header: t("common.endDate", { defaultValue: "End date" }),
      }),
      columHelperCampaigns.display({
        id: "actions",
        cell: (props) => (
          <Flex justify={"end"} gap={"1"} onClick={(e) => e.stopPropagation()}>
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/campaigns/${props.row.original.id}`}
              icon={"open_in_new"}
              ariaLabel={t("admin.campaignPreview", {
                defaultValue: "Open campaign details",
              })}
              tooltipLabel={t("admin.campaignPreview", {
                defaultValue: "Open campaign details",
              })}
            />
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItemLink
                lng={i18n.resolvedLanguage}
                href={ADMIN_CAMPAIGNS_UPDATE(props.row.original.id)}
                value={"edit"}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("common.edit", { defaultValue: "Edit" })}
              </MenuItemLink>
              <MenuItem
                value={"remove-modal"}
                onClick={() => handleRemoveCampaign(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.removeCampaign", { defaultValue: "Delete campaign" })}
              </MenuItem>
            </Menu>
          </Flex>
        ),
        meta: {
          isNumeric: true,
        },
        header: t("table.actions", { defaultValue: "Actions" }),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaignsData],
  );

  if (loadingPromotions || loadingCampaigns) {
    return <AdminLoadingSkeleton variant="table" rows={6} />;
  }

  return (
    <>
      <CustomHeading
        heading={t("ROUTES.promotions", { defaultValue: "Promotions" })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Heading my={"4"} size={"md"}>
        {t("ROUTES.promotions", { defaultValue: "Promotions" })}
      </Heading>
      <Flex flexDir={["column", "row"]} gap={["2", "0"]}>
        {/* <SearchInput
          placeholder={"Szukaj ofert wg # lub klienta..."}
          searchFn={searchQuotes}
        /> */}
        <Spacer />
        <RefreshButton
          w={["100%", "auto"]}
          label={t("admin.refreshPromotions", {
            defaultValue: "Refresh promotions",
          })}
          refreshFunction={refreshPromotions}
        />
        <ButtonLink
          lng={i18n.resolvedLanguage}
          ml={"2"}
          href={ADMIN_PROMOTIONS_CREATE}
          variant="solid"
          colorPalette={"primary"}
          ariaLabel={t("admin.newPromotion", { defaultValue: "New Promotion" })}
        >
          <MaterialSymbol>create</MaterialSymbol>
          {t("admin.newPromotion", { defaultValue: "New Promotion" })}
        </ButtonLink>
      </Flex>
      {!promotionsData || promotionsData.length === 0 ? (
        <Empty
          title={t("admin.noPromotions", { defaultValue: "No promotions yet" })}
          description={t("admin.noPromotionsDescription", {
            defaultValue: "Create a promotion to see it here.",
          })}
          icon={"sell"}
        />
      ) : (
        <DataTable
          columns={columnsPromotions}
          data={promotionsData}
          paginationType="uncontrolled"
          t={t}
          i18n={i18n}
        />
      )}
      <Separator my={"6"} />
      <Heading my={"4"} size={"md"}>
        {t("ROUTES.campaigns", { defaultValue: "Campaigns" })}
      </Heading>
      <Flex flexDir={["column", "row"]} gap={["2", "0"]}>
        {/* <SearchInput
          placeholder={"Szukaj ofert wg # lub klienta..."}
          searchFn={searchQuotes}
        /> */}
        <Spacer />
        <RefreshButton
          w={["100%", "auto"]}
          label={t("admin.refreshCampaigns", {
            defaultValue: "Refresh campaigns",
          })}
          refreshFunction={refreshCampaigns}
        />
        <ButtonLink
          lng={i18n.resolvedLanguage}
          ml={"2"}
          href={ADMIN_CAMPAIGNS_CREATE}
          variant="solid"
          colorPalette={"primary"}
          ariaLabel={t("admin.newCampaign", { defaultValue: "New Campaign" })}
        >
          <MaterialSymbol>create</MaterialSymbol>
          {t("admin.newCampaign", { defaultValue: "New Campaign" })}
        </ButtonLink>
      </Flex>
      {!campaignsData || campaignsData.length === 0 ? (
        <Empty
          title={t("admin.noCampaigns", { defaultValue: "No campaigns yet" })}
          description={t("admin.noCampaignsDescription", {
            defaultValue: "Create a campaign to see it here.",
          })}
          icon={"campaign"}
        />
      ) : (
        <DataTable
          columns={columnsCampaigns}
          data={campaignsData}
          paginationType="uncontrolled"
          t={t}
          i18n={i18n}
        />
      )}
      <AlertDialog
        header={t("admin.confirmDeactivatePromotion", {
          defaultValue: "Deactivate this promotion?",
        })}
        handle={() => deactivatePromotion(currentPromotion!.id)}
        open={showDeactivateDialog}
        setOpen={setShowDeactivateDialog}
        t={t}
      >
        <Text>
          {t("admin.deactivatePromotionDescription", {
            defaultValue:
              "The promotion will stay in the system, but customers will no longer be able to use it.",
          })}
        </Text>
      </AlertDialog>
      <AlertDialog
        header={t("admin.confirmRemovePromotion", {
          defaultValue: "Delete this promotion permanently?",
        })}
        handle={() => removePromotion(currentPromotion!.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>
          {t("promotions.promotionWillBeDeletedFromDatabase", {
            defaultValue:
              "This will permanently delete the promotion from the database.",
          })}
        </Text>
      </AlertDialog>
      <AlertDialog
        header={t("admin.confirmRemoveCampaign", {
          defaultValue: "Delete this campaign permanently?",
        })}
        handle={() => removeCampaign(currentCampaign!.id)}
        open={showRemoveCampaignDialog}
        setOpen={setShowRemoveCampaignDialog}
        t={t}
      >
        <Text>
          {t("promotions.campaignWillBeDeletedFromDatabase", {
            defaultValue:
              "This will permanently delete the campaign from the database.",
          })}
        </Text>
      </AlertDialog>
    </>
  );
}
