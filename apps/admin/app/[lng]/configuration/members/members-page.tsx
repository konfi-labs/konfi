"use client";

import { useT } from "@/i18n/client";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  Button,
  Flex,
  Separator,
  Skeleton,
  Spacer,
  Text,
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
import { Member } from "@konfi/types";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useAuth } from "context/auth";
import { useConfiguration } from "context/configuration";
import dynamic from "next/dynamic";
import { startTransition, useMemo, useState } from "react";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const MemberForm = dynamic(
  () => import("@/components/configuration/MemberForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);
const TenantAccessSection = dynamic(() => import("./TenantAccessSection"), {
  loading: () => <Skeleton />,
  ssr: false,
});

const MembersPage = () => {
  const { t, i18n } = useT();
  const { hasTenantWidePermission } = useAuth();
  const canManageMembers = hasTenantWidePermission(
    "configuration.members.manage",
  );
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const { members, removeMember, refreshMembers } = useConfiguration();
  const columHelper = createColumnHelper<Member>();
  const data = useMemo<Member[] | undefined>(
    () =>
      members
        ? filterLocalFuseItems(members, searchKey ?? "", {
            keys: ["name"],
            threshold: 0.34,
          })
        : undefined,
    [members, searchKey],
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  function handleCreateFormOpen() {
    startTransition(() => {
      setShowCreateForm(true);
    });
  }

  function handleUpdateFormOpen(member: Member) {
    startTransition(() => {
      setCurrentMember(member);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(member: Member) {
    startTransition(() => {
      setCurrentMember(member);
      setShowDuplicateForm(true);
    });
  }

  function handleRemove(member: Member) {
    startTransition(() => {
      setCurrentMember(member);
      setShowRemoveDialog(true);
    });
  }

  const columns = useMemo<ColumnDef<Member, any>[]>(
    () => [
      columHelper.accessor("name", {
        cell: (info) => info.getValue(),
        header: t("common.name"),
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
          >
            {canManageMembers && (
              <MenuItem
                value={"update-form"}
                onClick={() => handleUpdateFormOpen(props.row.original)}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("admin.editMember")}
              </MenuItem>
            )}
            {canManageMembers && (
              <MenuItem
                value={"duplicate-form"}
                onClick={() => handleDuplicateFormOpen(props.row.original)}
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("admin.copyMember")}
              </MenuItem>
            )}
            <MenuItem
              value={"deactivate-modal"}
              onClick={() => handleRemove(props.row.original)}
              color="fg.error"
              _hover={{ bg: "bg.error", color: "fg.error" }}
            >
              <MaterialSymbol>delete</MaterialSymbol>
              {t("admin.removeMember")}
            </MenuItem>
          </Menu>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    [canManageMembers, data, i18n.resolvedLanguage, t],
  );

  return (
    <>
      <CustomHeading
        heading={t("admin.team")}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex>
        <SearchInput
          placeholder={t("admin.searchTeamMemberByName")}
          searchFn={undefined}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          t={t}
        />
        <Spacer />
        <RefreshButton
          label={t("common.refresh") + " " + t("admin.teamMembers")}
          refreshFunction={refreshMembers}
        />
        {canManageMembers && (
          <Button
            ml={"4"}
            variant={"solid"}
            colorPalette={"primary"}
            onClick={handleCreateFormOpen}
          >
            <MaterialSymbol>person_add</MaterialSymbol>
            {t("admin.addMember")}
          </Button>
        )}
      </Flex>
      <Separator my={"6"} />
      {data && !(data.length <= 0) && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={"uncontrolled"}
          t={t}
          i18n={i18n}
        />
      )}
      <MemberForm
        type={"CREATE"}
        open={showCreateForm}
        setOpen={setShowCreateForm}
      />
      <MemberForm
        member={currentMember!}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
      />
      <MemberForm
        member={currentMember!}
        type={"DUPLICATE"}
        open={showDuplicateForm}
        setOpen={setShowDuplicateForm}
      />
      <AlertDialog
        header={t("admin.confirmRemoveMemberTitle")}
        handle={() => removeMember(currentMember!.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>{t("admin.removeMemberDescription")}</Text>
      </AlertDialog>
      <TenantAccessSection />
    </>
  );
};

export default MembersPage;
