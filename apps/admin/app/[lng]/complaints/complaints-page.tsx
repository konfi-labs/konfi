"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  createListCollection,
  Flex,
  Portal,
  Select,
  Separator,
  Skeleton,
  Spacer,
  Text,
} from "@chakra-ui/react";
import {
  AlertDialog,
  Avatar,
  AvatarGroup,
  ButtonLink,
  CustomHeading,
  DataTable,
  IconButtonLink,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
  Tooltip,
} from "@konfi/components";
import { update } from "@konfi/firebase";
import { Complaint, ComplaintStatus, Order, SelectOption } from "@konfi/types";
import {
  ADMIN_ORDERS,
  ADMIN_RMA_REQUESTS,
  getComplaintStatusColorPalette,
  getComplaintStatusLabel,
  getColorByStatus,
  getOpenComplaintStatusIds,
} from "@konfi/utils";
import { createColumnHelper, RowSelectionState } from "@tanstack/react-table";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isUndefined } from "es-toolkit";
import {
  collection,
  doc,
  DocumentData,
  limit as firestoreLimit,
  query as firestoreQuery,
  getCountFromServer,
  getDocs,
  orderBy,
  startAfter,
  where,
} from "firebase/firestore";
import dynamic from "next/dynamic";
import {
  createContext,
  Dispatch,
  memo,
  SetStateAction,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Fixed query function to avoid string type errors
const firebaseQuery = (collectionRef: any, ...queryConstraints: any[]) =>
  firestoreQuery(collectionRef, ...queryConstraints);

// Dynamic imports
const ComplaintForm = dynamic(
  () => import("@/components/orders/ComplaintForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

// Complaints Context
interface ComplaintsContextType {
  loadingComplaints: boolean;
  complaints: Complaint[];
  complaintsCount: number;
  activeComplaintsCount: number;
  pageIndex: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  showComplaints: (type: string, limit: number) => Promise<void>;
  searchComplaints: (query: string) => void;
  complaintsSearchResults: Complaint[] | null;
  cleanComplaintsSearchResults: () => void;
  deactivateComplaint: (id: string) => Promise<void>;
  queryConstraints: any[];
  setQueries: (queries: any[]) => void;
  refreshComplaints: () => void;
  updateComplaintStatus: (
    name: string,
    value: string | undefined,
    complaint: Complaint,
  ) => Promise<boolean>;
}

const ComplaintsContext = createContext<ComplaintsContextType | null>(null);

export function ComplaintsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [complaintsCount, setComplaintsCount] = useState(0);
  const [activeComplaintsCount, setActiveComplaintsCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [queryConstraints, setQueryConstraints] = useState<any[]>([]);
  const [complaintsSearchResults, setComplaintsSearchResults] = useState<
    Complaint[] | null
  >(null);

  const { channel } = useChannels();
  const { supportTaxonomySettings } = useConfiguration();
  const tenantContext = useTenantContext();
  const openComplaintStatusIds = useMemo(
    () => getOpenComplaintStatusIds(supportTaxonomySettings),
    [supportTaxonomySettings],
  );

  const showComplaints = useCallback(
    async (type: string, limitNum: number) => {
      if (!channel) return;

      setLoadingComplaints(true);

      try {
        const complaintsRef = collection(
          firestore,
          `channels/${channel.id}/complaints`,
        );

        // Create base query
        let baseQuery = firebaseQuery(
          complaintsRef,
          where("active", "==", true),
        );

        // Apply additional constraints if any
        if (queryConstraints.length > 0) {
          baseQuery = firebaseQuery(
            complaintsRef,
            ...queryConstraints,
            where("active", "==", true),
          );
        }

        // Determine final query based on pagination type
        let finalQuery;
        if (type === "FIRST") {
          finalQuery = firebaseQuery(
            baseQuery,
            orderBy("createdAt", "desc"),
            firestoreLimit(limitNum),
          );
          setPageIndex(0);
        } else if (type === "NEXT" && lastVisible) {
          finalQuery = firebaseQuery(
            baseQuery,
            orderBy("createdAt", "desc"),
            startAfter(lastVisible),
            firestoreLimit(limitNum),
          );
        } else {
          finalQuery = firebaseQuery(
            baseQuery,
            orderBy("createdAt", "desc"),
            firestoreLimit(limitNum),
          );
        }

        const querySnapshot = await getDocs(finalQuery);
        const complaintsData: Complaint[] = [];

        querySnapshot.forEach((doc) => {
          const docData = doc.data() as DocumentData;
          complaintsData.push({ id: doc.id, ...docData } as Complaint);
        });

        // Get total count for pagination
        const countQuery = firebaseQuery(
          complaintsRef,
          where("active", "==", true),
          ...(queryConstraints.length > 0 ? queryConstraints : []),
        );

        const countSnapshot = await getCountFromServer(countQuery);
        setComplaintsCount(countSnapshot.data().count);

        // Get active count
        if (openComplaintStatusIds.length === 0) {
          setActiveComplaintsCount(0);
        } else {
          let nextActiveComplaintsCount = 0;
          for (
            let index = 0;
            index < openComplaintStatusIds.length;
            index += 10
          ) {
            const statusChunk = openComplaintStatusIds.slice(index, index + 10);
            const activeCountQuery = firebaseQuery(
              complaintsRef,
              where("active", "==", true),
              where("status", "in", statusChunk),
            );
            const activeCountSnapshot =
              await getCountFromServer(activeCountQuery);
            nextActiveComplaintsCount += activeCountSnapshot.data().count;
          }
          setActiveComplaintsCount(nextActiveComplaintsCount);
        }

        // Update state
        setComplaints(complaintsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      } catch (error) {
        console.error("Error fetching complaints:", error);
      } finally {
        setLoadingComplaints(false);
      }
    },
    [channel, pageIndex, queryConstraints, lastVisible, openComplaintStatusIds],
  );

  const searchComplaints = useCallback(
    async (query: string) => {
      if (!channel || !query) return;

      setLoadingComplaints(true);

      try {
        const complaintsRef = collection(
          firestore,
          `channels/${channel.id}/complaints`,
        );

        // Simple search by orderId or description
        const querySnapshot = await getDocs(
          firebaseQuery(
            complaintsRef,
            where("active", "==", true),
            orderBy("createdAt", "desc"),
          ),
        );

        const results: Complaint[] = [];

        querySnapshot.forEach((doc) => {
          const complaint = {
            id: doc.id,
            ...(doc.data() as DocumentData),
          } as Complaint;

          // Simple text search - this could be improved with a proper search index
          if (
            complaint.orderId.toString().includes(query) ||
            complaint.description.toLowerCase().includes(query.toLowerCase()) ||
            complaint.orderItemIds.some((item) => item.includes(query))
          ) {
            results.push(complaint);
          }
        });

        setComplaintsSearchResults(results);
      } catch (error) {
        console.error("Error searching complaints:", error);
      } finally {
        setLoadingComplaints(false);
      }
    },
    [channel],
  );

  const cleanComplaintsSearchResults = useCallback(() => {
    setComplaintsSearchResults(null);
  }, []);

  const deactivateComplaint = useCallback(
    async (id: string) => {
      if (!channel || !id) return;

      try {
        const complaintRef = doc(
          firestore,
          `channels/${channel.id}/complaints`,
          id,
        );

        await update({ active: false }, complaintRef, tenantContext);

        // Update local state
        setComplaints((prev) =>
          prev.filter((complaint) => complaint.id !== id),
        );

        if (complaintsSearchResults) {
          setComplaintsSearchResults((prev) =>
            prev ? prev.filter((complaint) => complaint.id !== id) : null,
          );
        }
      } catch (error) {
        console.error("Error deactivating complaint:", error);
      }
    },
    [channel, complaintsSearchResults, tenantContext],
  );

  const setQueries = useCallback((queries: any[]) => {
    setQueryConstraints(queries);
    setPageIndex(0);
  }, []);

  const refreshComplaints = useCallback(() => {
    showComplaints("FIRST", 30);
  }, [showComplaints]);

  // Load initial data
  useEffect(() => {
    if (channel) {
      showComplaints("FIRST", 30);
    }
  }, [channel, queryConstraints]);

  const updateComplaintStatus = useCallback(
    async (name: string, value: string | undefined, complaint: Complaint) => {
      if (!channel) throw "channelId is null";

      try {
        // Update in Firestore
        await update(
          { [name]: value },
          doc(
            firestore,
            "/channels/" + channel.id + "/complaints",
            complaint.id,
          ),
          tenantContext,
        );

        // Update local state
        setComplaints((prev) =>
          prev.map((c) =>
            c.id === complaint.id ? { ...c, [name]: value } : c,
          ),
        );

        // Also update search results if they exist
        if (complaintsSearchResults) {
          setComplaintsSearchResults((prev) =>
            prev
              ? prev.map((c) =>
                  c.id === complaint.id ? { ...c, [name]: value } : c,
                )
              : null,
          );
        }

        return true;
      } catch (error) {
        console.error("Error updating complaint:", error);
        return false;
      }
    },
    [channel, complaintsSearchResults, tenantContext],
  );

  return (
    <ComplaintsContext.Provider
      value={{
        loadingComplaints,
        complaints,
        complaintsCount,
        activeComplaintsCount,
        pageIndex,
        setPageIndex,
        showComplaints,
        searchComplaints,
        complaintsSearchResults,
        cleanComplaintsSearchResults,
        deactivateComplaint,
        queryConstraints,
        setQueries,
        refreshComplaints,
        updateComplaintStatus, // Add this new function to the context
      }}
    >
      {children}
    </ComplaintsContext.Provider>
  );
}

export const useComplaints = () => {
  const context = useContext(ComplaintsContext);
  if (!context) {
    throw new Error("useComplaints must be used within a ComplaintsProvider");
  }
  return context;
};

// Order fetching hook
const useOrderFetching = () => {
  const { channel } = useChannels();

  const fetchOrderById = useCallback(
    async (orderId: string): Promise<Order | null> => {
      if (!channel || !orderId) return null;

      try {
        const orderRef = doc(
          firestore,
          `channels/${channel.id}/orders`,
          orderId,
        );
        const orderSnap = await getDocs(
          firestoreQuery(
            collection(firestore, `channels/${channel.id}/orders`),
            where("id", "==", orderId),
          ),
        );

        if (!orderSnap.empty) {
          const orderDoc = orderSnap.docs[0];
          return { id: orderDoc.id, ...orderDoc.data() } as Order;
        }

        return null;
      } catch (error) {
        console.error("Error fetching order:", error);
        return null;
      }
    },
    [channel],
  );

  return { fetchOrderById };
};

// Components for the complaints page
interface ComplaintActionsProps {
  complaint: Complaint;
  onUpdateForm: (complaint: Complaint) => void;
  onDeactivate: (complaint: Complaint) => void;
}

const ComplaintActions = memo(
  ({ complaint, onUpdateForm, onDeactivate }: ComplaintActionsProps) => {
    const { t, i18n } = useT(["orders", "translation"]);

    return (
      <Flex justify={"end"} gap={"1"} onClick={(e) => e.stopPropagation()}>
        <IconButtonLink
          lng={i18n.resolvedLanguage}
          href={`/complaints/${complaint.id}`}
          icon={"open_in_new"}
          aria-label={t("admin.complaintPreview", {
            defaultValue: "Complaint preview",
          })}
          variant={"ghost"}
          tooltipLabel={t("admin.complaintPreview", {
            defaultValue: "Complaint preview",
          })}
        ></IconButtonLink>
        <Menu
          icon={<MaterialSymbol>menu_open</MaterialSymbol>}
          ariaLabel={t("table.actions", { defaultValue: "Actions" })}
        >
          <MenuItem
            value={"update-form"}
            onClick={() => onUpdateForm(complaint)}
          >
            <MaterialSymbol>edit_square</MaterialSymbol>
            {t("admin.editComplaint", { defaultValue: "Edit complaint" })}
          </MenuItem>
          <MenuItem
            value={"deactivate-modal"}
            onClick={() => onDeactivate(complaint)}
            color="fg.error"
            _hover={{ bg: "bg.error", color: "fg.error" }}
          >
            <MaterialSymbol>delete</MaterialSymbol>
            {t("orders.complaintsPage.deactivateComplaint", {
              defaultValue: "Deactivate complaint",
            })}
          </MenuItem>
        </Menu>
      </Flex>
    );
  },
);

// Status Select Component
const StatusSelect = memo(
  ({
    value,
    options,
    onChange,
  }: {
    value: string | undefined;
    options: SelectOption[];
    onChange: (value: string | undefined) => void;
  }) => {
    const collection = useMemo(
      () =>
        createListCollection({
          items: options.map((option) => ({
            label: option.label,
            value: option.value,
          })),
        }),
      [options],
    );
    const colors = getColorByStatus(value as ComplaintStatus);

    return (
      <Select.Root
        size="xs"
        collection={collection}
        value={value ? [value] : []}
        onValueChange={({ value: nextValue }) => onChange(nextValue[0])}
      >
        <Select.HiddenSelect />
        <Select.Control
          bgColor={colors.bgColor}
          borderRadius="full"
          minW="100px"
          cursor="pointer"
        >
          <Select.Trigger>
            <Select.ValueText
              placeholder="Select status"
              color={colors.color}
            />
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              {collection.items.map((item) => (
                <Select.Item item={item} key={item.value}>
                  {item.label}
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>
    );
  },
);

// Main Component Implementation
const ComplaintsPageContent = () => {
  const { t, i18n } = useT(["orders", "translation"]);
  const {
    loadingComplaints,
    pageIndex,
    setPageIndex,
    complaints,
    complaintsCount,
    showComplaints,
    searchComplaints,
    complaintsSearchResults,
    cleanComplaintsSearchResults,
    deactivateComplaint,
    queryConstraints,
    setQueries,
    refreshComplaints,
    updateComplaintStatus,
  } = useComplaints();
  const { members, supportTaxonomySettings } = useConfiguration();
  const { fetchOrderById } = useOrderFetching();
  const resolvedLanguage = i18n.resolvedLanguage ?? "pl";
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [currentComplaint, setCurrentComplaint] = useState<Complaint | null>(
    null,
  );

  const columHelper = createColumnHelper<Complaint>();
  const data = useMemo<Complaint[] | undefined>(
    () =>
      complaintsSearchResults
        ? complaintsSearchResults?.map((complaint) => complaint)
        : complaints?.map((complaint) => complaint),
    [complaints, complaintsSearchResults],
  );

  // Fetch order when currentComplaint changes
  useEffect(() => {
    const loadOrderForComplaint = async () => {
      if (currentComplaint?.orderId) {
        const order = await fetchOrderById(currentComplaint.orderId);
        setCurrentOrder(order);
      }
    };

    loadOrderForComplaint();
  }, [currentComplaint, fetchOrderById]);

  const statusOptions = useMemo(
    () =>
      supportTaxonomySettings.complaintStatuses
        .filter((status) => status.enabled && !status.archived)
        .map(
          (status) =>
            ({
              label: getComplaintStatusLabel(
                status.id,
                supportTaxonomySettings,
                t,
                i18n.resolvedLanguage ?? i18n.language,
              ),
              value: status.id,
              color: getComplaintStatusColorPalette(
                status.id,
                supportTaxonomySettings,
              ),
            }) as SelectOption,
        ),
    [i18n.language, i18n.resolvedLanguage, supportTaxonomySettings, t],
  );

  const membersOptions = useMemo(
    () =>
      members
        ? members.map((member) => ({
            label: member.name,
            value: member.id,
          }))
        : [],
    [members],
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeactivateMultipleDialog, setShowDeactivateMultipleDialog] =
    useState(false);

  function handleDeactivateComplaints() {
    const rowIds = Object.keys(rowSelection);
    if (isUndefined(data)) return;
    for (let i = 0; i < rowIds.length; i++) {
      const rowId = rowIds[i];
      const complaintId = data[Number(rowId)]?.id;
      deactivateComplaint(complaintId);
      setRowSelection({});
    }
  }

  const handleUpdateFormOpen = useCallback((complaint: Complaint) => {
    startTransition(() => {
      setCurrentComplaint(complaint);
      setShowUpdateForm(true);
    });
  }, []);

  const handleDeactivateComplaintModalOpen = useCallback(
    (complaint: Complaint) => {
      startTransition(() => {
        setCurrentComplaint(complaint);
        setShowDeactivateDialog(true);
      });
    },
    [],
  );

  const handleDeactivateComplaintsModalOpen = useCallback(() => {
    startTransition(() => {
      setShowDeactivateMultipleDialog(true);
    });
  }, []);

  const handleStatusChange = useCallback(
    async (value: string | undefined, complaint: Complaint) => {
      startTransition(() => {
        updateComplaintStatus("status", value, complaint).then((success) => {
          if (success) {
            // Optional: Add feedback like a toast notification here if needed
          }
        });
      });
    },
    [updateComplaintStatus],
  );

  const columns = useMemo(
    () => [
      columHelper.accessor("orderId", {
        cell: (info) => (
          <ButtonLink
            lng={i18n.resolvedLanguage}
            href={ADMIN_ORDERS + `/${info.getValue()}`}
            ariaLabel={`${info.getValue()}`}
          >
            {`${info.getValue()}`}
            <MaterialSymbol>open_in_new</MaterialSymbol>
          </ButtonLink>
        ),
        header: t("orders.complaintsPage.orderId", {
          defaultValue: "Order ID",
        }),
      }),
      columHelper.accessor("description", {
        cell: (info) => (
          <Tooltip content={info.getValue()}>
            <Text
              width={"150px"}
              overflow={"hidden"}
              whiteSpace={"nowrap"}
              textOverflow={"ellipsis"}
            >
              {info.getValue()}
            </Text>
          </Tooltip>
        ),
        header: t("orders.complaintsPage.description", {
          defaultValue: "Description",
        }),
      }),
      columHelper.accessor("status", {
        cell: (props) => (
          <div onClick={(e) => e.stopPropagation()}>
            <StatusSelect
              value={props.cell.getValue()}
              options={statusOptions}
              onChange={(value) =>
                handleStatusChange(value, props.row.original)
              }
            />
          </div>
        ),
        header: t("orders.complaintsPage.status", { defaultValue: "Status" }),
      }),
      columHelper.accessor("carriedOutBy", {
        cell: (info) => {
          const value = info.getValue();
          return (
            <AvatarGroup stacking={"first-on-top"}>
              {value?.map((item: string, index: number) => (
                <Avatar key={index} name={item} />
              ))}
            </AvatarGroup>
          );
        },
        header: t("orders.complaintsPage.executors", {
          defaultValue: "Executors",
        }),
      }),
      columHelper.accessor("createdAt", {
        cell: (info) =>
          new Date(info.getValue().toDate()).toLocaleDateString(
            i18n.resolvedLanguage,
          ),
        header: t("orders.complaintsPage.createdAt", {
          defaultValue: "Created on",
        }),
      }),
      columHelper.display({
        id: "actions",
        cell: ({ row }: { row: { original: Complaint } }) => (
          <ComplaintActions
            complaint={row.original}
            onUpdateForm={handleUpdateFormOpen}
            onDeactivate={handleDeactivateComplaintModalOpen}
          />
        ),
        meta: {
          isNumeric: true,
        },
        header: t("orders.complaintsPage.actions", { defaultValue: "Actions" }),
      }),
    ],
    [statusOptions, handleStatusChange],
  );

  return (
    <>
      <CustomHeading
        heading={t("orders.complaintsPage.title", {
          defaultValue: "Complaints",
        })}
        mb={"8"}
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Flex flexDir={["column", "row"]} gap={2}>
        <SearchInput
          placeholder={t("orders.complaintsPage.searchComplaints", {
            defaultValue: "Search complaints...",
          })}
          searchFn={searchComplaints}
          cleanFn={cleanComplaintsSearchResults}
          searchResults={complaintsSearchResults}
          loading={loadingComplaints}
          t={t}
        />
        {Object.keys(rowSelection).length > 0 && (
          <Flex pos={"relative"}>
            <Badge
              variant={"solid"}
              minW={"18px"}
              textAlign={"center"}
              colorPalette={"primary"}
              position={"absolute"}
              top={"-3px"}
              right={"-3px"}
              fontSize={"xs"}
              zIndex={"200"}
              px={"1.5"}
              py={"0"}
            >
              {Object.keys(rowSelection).length}
            </Badge>
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value={"deactivate-modal"}
                onClick={() => handleDeactivateComplaintsModalOpen()}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("orders.complaintsPage.deactivateComplaints", {
                  defaultValue: "Deactivate complaints",
                })}
              </MenuItem>
            </Menu>
          </Flex>
        )}
        <Spacer />
        <ButtonLink
          ariaLabel={t("orders.complaintsPage.openRmaRequests", {
            defaultValue: "Open RMA requests",
          })}
          href={ADMIN_RMA_REQUESTS}
          lng={resolvedLanguage}
        >
          <MaterialSymbol>assignment_return</MaterialSymbol>
          {t("orders.complaintsPage.rmaRequests", {
            defaultValue: "RMA Requests",
          })}
        </ButtonLink>
        <RefreshButton
          label={t("orders.complaintsPage.refreshComplaints", {
            defaultValue: "Refresh complaints",
          })}
          refreshFunction={refreshComplaints}
        />
      </Flex>
      <Separator mt={"6"} />
      {data && data.length > 0 && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={"controlled"}
          show={
            complaintsSearchResults
              ? (type, limit) => {
                  if (type === "NEXT") setPageIndex(pageIndex + 1);
                  if (type === "PREVIOUS")
                    setPageIndex(Math.max(0, pageIndex - 1));
                  if (type === "FIRST") setPageIndex(0);
                  if (type === "LAST")
                    setPageIndex(
                      Math.floor((complaintsSearchResults.length - 1) / limit),
                    );
                  return Promise.resolve();
                }
              : showComplaints
          }
          itemsCount={
            complaintsSearchResults
              ? complaintsSearchResults.length
              : complaintsCount
          }
          loading={loadingComplaints}
          defaultPageIndex={pageIndex}
          defaultPageSize={
            queryConstraints.length > 0 || complaintsSearchResults ? 99 : 30
          }
          setPageIndex={setPageIndex}
          enableRowSelection={{ rowSelection, setRowSelection }}
          isRowCollapsable={true}
          enableSorting={queryConstraints.length > 0}
          t={t}
          i18n={i18n}
        />
      )}
      <ComplaintForm
        complaint={currentComplaint!}
        order={currentOrder!}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
      />
      <AlertDialog
        header={t("orders.complaintsPage.confirmDeactivateComplaint", {
          defaultValue: "Are you sure you want to deactivate the complaint?",
        })}
        handle={() => deactivateComplaint(currentComplaint!.id)}
        open={showDeactivateDialog}
        setOpen={setShowDeactivateDialog}
        t={t}
      >
        <Text>
          {t("orders.complaintsPage.deactivateComplaintDescription", {
            defaultValue:
              "After deactivation, the complaint will be visible only under the filter - inactive.",
          })}
        </Text>
      </AlertDialog>
      <AlertDialog
        header={t("orders.complaintsPage.confirmDeactivateComplaints", {
          defaultValue: "Are you sure you want to deactivate the complaints?",
        })}
        handle={() => handleDeactivateComplaints()}
        open={showDeactivateMultipleDialog}
        setOpen={setShowDeactivateMultipleDialog}
        t={t}
      >
        <Text>
          {t("orders.complaintsPage.deactivateComplaintsDescription", {
            defaultValue:
              "After deactivation, the complaints will be visible only under the filter - inactive.",
          })}
        </Text>
      </AlertDialog>
    </>
  );
};

// Wrap the page content with the provider
const ComplaintsPage = () => (
  <ComplaintsProvider>
    <ComplaintsPageContent />
  </ComplaintsProvider>
);

export default ComplaintsPage;
