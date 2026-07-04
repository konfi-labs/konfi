"use client";

import { createRmaRequestForComplaint } from "@/actions/complaints";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore, storage } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Heading,
  HStack,
  Separator,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  AlertDialog,
  CustomerInfo,
  CustomHeading,
  MaterialSymbol,
  OrderItemsFileList,
  PrintingMethodsGroup,
  toaster,
} from "@konfi/components";
import { fetchOrderItemFiles, update } from "@konfi/firebase";
import {
  Complaint,
  ComplaintStatus,
  isNestedCustomer,
  Order,
  OrderItem,
  RmaRequestType,
} from "@konfi/types";
import { getStatusColor } from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isEmpty, isNull, isUndefined } from "es-toolkit/compat";
import { doc, getDoc } from "firebase/firestore";
import { Route } from "next";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import useSWRImmutable from "swr/immutable";

const ComplaintForm = dynamic(
  () => import("@/components/orders/ComplaintForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const ComplaintDetail = () => {
  const { t, i18n } = useT(["orders", "translation"]);
  const { id } = useParams();
  const router = useRouter();
  const { channel } = useChannels();
  const {
    printingMethodsSettings,
    orderWorkflowStatusesSettings,
    shippingMethodsSettings,
  } = useConfiguration();
  const tenantContext = useTenantContext();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showFiles, setShowFiles] = useState<boolean>(true);
  const [isCreatingRma, startCreatingRma] = useTransition();
  const borderColor = "gray.muted";

  const { data: files, isValidating } = useSWRImmutable(
    !isEmpty(order) &&
      !isNull(order) &&
      !isUndefined(order) &&
      !isEmpty(orderItems) &&
      !isNull(orderItems) &&
      isNestedCustomer(order.customer)
      ? [order.id, order.customer.id, order.channelId, orderItems]
      : null,
    ([orderId, customerId, channelId, _orderItems]) =>
      fetchOrderItemFiles(
        orderId,
        customerId,
        _orderItems,
        tenantContext,
        channelId,
      ),
  );

  const fetchComplaint = useCallback(async () => {
    if (!channel || !id) return;
    try {
      setLoading(true);
      const complaintRef = doc(
        firestore,
        `channels/${channel.id}/complaints`,
        id as string,
      );
      const complaintSnap = await getDoc(complaintRef);

      if (complaintSnap.exists()) {
        const complaintData = {
          id: complaintSnap.id,
          ...complaintSnap.data(),
        } as Complaint;

        setComplaint(complaintData);

        // Fetch related order
        const orderRef = doc(
          firestore,
          `channels/${channel.id}/orders`,
          complaintData.orderId,
        );
        const orderSnap = await getDoc(orderRef);

        if (orderSnap.exists()) {
          setOrder({
            id: orderSnap.id,
            ...orderSnap.data(),
          } as Order);
        }
      } else {
        console.error("Complaint not found");
      }
    } catch (error) {
      console.error("Error fetching complaint:", error);
    } finally {
      setLoading(false);
    }
  }, [channel, id]);

  const deactivateComplaint = async () => {
    if (!channel || !complaint) return;

    try {
      const complaintRef = doc(
        firestore,
        `channels/${channel.id}/complaints`,
        complaint.id,
      );

      await update({ active: false }, complaintRef, tenantContext);

      // Redirect to complaints list
      router.push("/orders/complaints");
    } catch (error) {
      console.error("Error deactivating complaint:", error);
    }
  };

  const createRmaClaim = () => {
    if (!channel || !complaint) return;

    startCreatingRma(() => {
      void (async () => {
        try {
          await createRmaRequestForComplaint({
            channelId: channel.id,
            complaintId: complaint.id,
            type: RmaRequestType.CLAIM,
          });
          toaster.success({
            title: t("admin.rmaCreatedTitle", {
              defaultValue: "RMA request created",
            }),
            description: t("admin.rmaCreatedDescription", {
              defaultValue:
                "The complaint is now linked to a structured claim request.",
            }),
          });
          await fetchComplaint();
        } catch (error) {
          console.error("Error creating RMA request:", error);
          toaster.error({
            title: t("admin.rmaCreateFailedTitle", {
              defaultValue: "RMA request was not created",
            }),
            description: t("admin.rmaCreateFailedDescription", {
              defaultValue: "Check the complaint and try again.",
            }),
          });
        }
      })();
    });
  };

  // Set order items
  useEffect(() => {
    if (isUndefined(order)) return;
    const nextOrderItems: OrderItem[] = [];
    if (order?.items && !(order.items.length <= 0))
      nextOrderItems.push(...order.items);
    setOrderItems(nextOrderItems);
  }, [order]);

  useEffect(() => {
    fetchComplaint();
  }, [fetchComplaint]);

  if (loading || isUndefined(order) || isNull(order) || isNull(orderItems)) {
    return (
      <Box p={4}>
        <Skeleton height="60px" width="50%" mb={4} />
        <Skeleton height="200px" mb={4} />
        <Skeleton height="100px" mb={4} />
      </Box>
    );
  }

  if (!complaint) {
    return (
      <Box p={4}>
        <Text>
          {t("complaint.notFound", { defaultValue: "Complaint not found" })}
        </Text>
        <Button onClick={() => router.push("/orders/complaints")} mt={4}>
          <MaterialSymbol>arrow_back</MaterialSymbol>
          {t("common.back", { defaultValue: "Back to complaints list" })}
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Skeleton loading={loading}>
        <Grid
          className={"print-grid-template-columns"}
          templateColumns={["repeat(1, 1fr)", "repeat(5, 1fr)"]}
          columnGap={["0", "8"]}
          rowGap={["6", "8"]}
        >
          <GridItem minW={"100%"} colSpan={[1, 3]} overflowX={"auto"}>
            <HStack justify={"space-between"}>
              <Box>
                <CustomHeading
                  heading={t("orders.complaintPage.heading")}
                  mb={8}
                  breadcrumb={true}
                  goBack={true}
                  t={t}
                />
                <Badge pl={3} pr={4} mb={8}>
                  {t("admin.createdOn")}:{" "}
                  {complaint?.createdAt
                    .toDate()
                    .toLocaleDateString(i18n.resolvedLanguage)}
                </Badge>
              </Box>
            </HStack>

            <Box
              border="1px solid"
              borderColor={borderColor}
              borderRadius={"3xl"}
              p={"8"}
            >
              <Stack direction={["column", "row", "row", "row"]}>
                <Heading size="lg">{t("admin.complaintDetails")}</Heading>
              </Stack>
              <Separator my={"6"} />

              <Flex direction="column" gap={4}>
                <Box>
                  <Text fontWeight="medium" mb={1}>
                    {t("admin.complaintDescription")}:
                  </Text>
                  <Box
                    p={3}
                    bg={{ base: "gray.50", _dark: "black" }}
                    borderRadius="md"
                  >
                    <Text>{complaint.description}</Text>
                  </Box>
                </Box>
                <Box>
                  <Text fontWeight="medium" mb={1}>
                    {t("admin.assignedEmployees")}:
                  </Text>
                  <Box
                    p={3}
                    bg={{ base: "gray.50", _dark: "black" }}
                    borderRadius="md"
                  >
                    {complaint.carriedOutBy &&
                    complaint.carriedOutBy.length > 0 ? (
                      complaint.carriedOutBy.map((member, index) => (
                        <Badge key={index} m={1}>
                          {member}
                        </Badge>
                      ))
                    ) : (
                      <Text color="gray.500">
                        {t("admin.noAssignedEmployees")}
                      </Text>
                    )}
                  </Box>
                </Box>

                <Box>
                  <Text fontWeight="medium" mb={1}>
                    {t("admin.complaintStatus", {
                      defaultValue: "Complaint status",
                    })}
                    :
                  </Text>
                  <Badge
                    colorScheme={
                      complaint.status === ComplaintStatus.NEW
                        ? "blue"
                        : "green"
                    }
                  >
                    {t(`ComplaintStatus.${complaint.status}`)}
                  </Badge>
                </Box>

                <Box>
                  <Text fontWeight="medium" mb={1}>
                    {t("admin.rmaRequests", {
                      defaultValue: "RMA requests",
                    })}
                    :
                  </Text>
                  <Box
                    p={3}
                    bg={{ base: "gray.50", _dark: "black" }}
                    borderRadius="md"
                  >
                    <Stack gap={3}>
                      {complaint.rmaRequestIds?.length ? (
                        <HStack gap={2} flexWrap="wrap">
                          {complaint.rmaRequestIds.map((rmaRequestId) => (
                            <Badge key={rmaRequestId} variant="subtle">
                              {rmaRequestId}
                            </Badge>
                          ))}
                        </HStack>
                      ) : (
                        <Text color="gray.500">
                          {t("admin.noRmaRequests", {
                            defaultValue: "No linked RMA requests",
                          })}
                        </Text>
                      )}
                      <Button
                        alignSelf="flex-start"
                        colorPalette="primary"
                        disabled={
                          isCreatingRma || complaint.orderItemIds.length === 0
                        }
                        loading={isCreatingRma}
                        onClick={createRmaClaim}
                        size="sm"
                        variant="outline"
                      >
                        <MaterialSymbol>assignment_return</MaterialSymbol>
                        {t("admin.createRmaClaim", {
                          defaultValue: "Create RMA Claim",
                        })}
                      </Button>
                    </Stack>
                  </Box>
                </Box>
              </Flex>
            </Box>
            {!isNull(orderItems) && (
              <Box
                w={"100%"}
                mb={["6", "0"]}
                border="1px solid"
                borderColor={borderColor}
                borderRadius={"3xl"}
                p={"8"}
                mt={8}
              >
                <Stack direction={["column", "row", "row", "row"]}>
                  <HStack>
                    <Heading size={"lg"}>{t("admin.complaintItems")}</Heading>
                    {order.printingMethods && (
                      <PrintingMethodsGroup
                        values={order.printingMethods}
                        settings={printingMethodsSettings}
                        t={t}
                      />
                    )}
                  </HStack>
                  {!isEmpty(files) && (
                    <Button
                      ml={"auto"}
                      colorPalette={"primary"}
                      size={"xs"}
                      variant={"ghost"}
                      onClick={() => setShowFiles(!showFiles)}
                    >
                      <MaterialSymbol>
                        {showFiles ? "visibility_off" : "visibility"}
                      </MaterialSymbol>
                      {showFiles ? t("admin.hideFiles") : t("admin.showFiles")}
                    </Button>
                  )}
                </Stack>
                <Separator my={"6"} />
                <Skeleton loading={isValidating}>
                  <OrderItemsFileList
                    storage={storage}
                    customerId={
                      isNestedCustomer(order.customer) ? order.customer.id : ""
                    }
                    channelId={order.channelId}
                    orderId={order.id}
                    orderStatus={order.status}
                    orderShippingOption={order.shippingOption}
                    orderWorkflowStatusesSettings={
                      orderWorkflowStatusesSettings
                    }
                    shippingMethodsSettings={shippingMethodsSettings}
                    orderFulfilledItems={order.fulfilledItems}
                    orderInProgressItems={order.inProgressItems}
                    orderItems={orderItems}
                    listResults={files}
                    showFiles={showFiles}
                    isStore={order.isFromStore}
                    t={t}
                    i18n={i18n}
                  />
                </Skeleton>
              </Box>
            )}
          </GridItem>

          <GridItem
            className={"print-grid-column-2"}
            minW={"100%"}
            colSpan={[1, 2]}
            mt={8}
          >
            <Stack
              justifyContent="flex-end"
              direction={{ base: "row", xlDown: "column" }}
              pt={"8"}
              pb={"7"}
            >
              <Button
                onClick={() => setShowUpdateForm(true)}
                colorPalette="primary"
                variant="solid"
              >
                <MaterialSymbol>edit</MaterialSymbol>
                {t("common.edit")}
              </Button>
              <Button
                colorPalette="gray"
                variant="outline"
                onClick={() => setShowDeactivateDialog(true)}
              >
                <MaterialSymbol>visibility_off</MaterialSymbol>
                {t("admin.deactivate")}
              </Button>
            </Stack>
            {order && (
              <Box
                border="1px solid"
                borderColor={borderColor}
                borderRadius={"3xl"}
                p={"8"}
              >
                <Text
                  color={"primary.solid"}
                  fontSize="lg"
                  fontWeight="bold"
                  mb={4}
                >
                  {t("admin.orderInformation")}
                </Text>
                <Separator mb={4} />

                <Flex direction="column" gap={3}>
                  <Flex justify="space-between">
                    <Text fontWeight="medium">{t("admin.orderNumber")}:</Text>
                    <Text>#{order.number}</Text>
                  </Flex>

                  <Flex justify="space-between">
                    <Text fontWeight="medium">{t("admin.customer")}:</Text>
                    <Text>
                      {typeof order.customer === "string"
                        ? order.customer
                        : order.customer?.name || t("admin.noData")}
                    </Text>
                  </Flex>

                  <Flex justify="space-between">
                    <Text fontWeight="medium">{t("admin.orderStatus")}:</Text>
                    <Badge colorPalette={getStatusColor(order.status)}>
                      {t(`OrderStatus.${order.status}`)}
                    </Badge>
                  </Flex>

                  <Flex justify="space-between">
                    <Text fontWeight="medium">{t("admin.orderDate")}:</Text>
                    <Text>
                      {new Date(order.createdAt.toDate()).toLocaleDateString(
                        i18n.resolvedLanguage,
                      )}
                    </Text>
                  </Flex>

                  <Flex justify="space-between">
                    <Text fontWeight="medium">{t("admin.deadline")}:</Text>
                    <Text>
                      {order.deadlineString
                        ? new Date(order.deadlineString).toLocaleDateString(
                            i18n.resolvedLanguage,
                          )
                        : order.deadline
                          ? new Date(
                              order.deadline.toDate(),
                            ).toLocaleDateString(i18n.resolvedLanguage)
                          : t("admin.notSpecified")}
                    </Text>
                  </Flex>

                  <Button
                    variant="outline"
                    onClick={() => router.push(`/orders/${order.id}` as Route)}
                    alignSelf="flex-end"
                    size="sm"
                    mt={2}
                  >
                    <MaterialSymbol>open_in_new</MaterialSymbol>
                    {t("admin.goToOrder")}
                  </Button>
                </Flex>
              </Box>
            )}
          </GridItem>
        </Grid>
        <CustomerInfo
          id={complaint.id}
          updatedAt={complaint.updatedAt}
          updatedBy={complaint.updatedBy}
          createdAt={complaint.createdAt}
          createdBy={complaint.createdBy}
          t={t}
          lng={i18n.resolvedLanguage}
        />
      </Skeleton>

      <ComplaintForm
        complaint={complaint!}
        order={order!}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
      />

      <AlertDialog
        header={t("admin.confirmDeactivateComplaint")}
        handle={deactivateComplaint}
        open={showDeactivateDialog}
        setOpen={setShowDeactivateDialog}
        t={t}
      >
        <Text>{t("admin.deactivateComplaintDescription")}</Text>
      </AlertDialog>
    </Box>
  );
};

export default ComplaintDetail;
