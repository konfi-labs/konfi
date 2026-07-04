import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Badge, Box, HStack, Separator, Text, VStack } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  CustomDialog,
  FormController,
  MaterialSymbol,
  toaster,
} from "@konfi/components";
import { db, update } from "@konfi/firebase";
import {
  Channel,
  Order,
  OrderAddTracking,
  ShippingOptions,
  TenantContext,
  TrackingScan,
} from "@konfi/types";
import { detectCourier, trackingForm, TrackingSchema } from "@konfi/utils";
import { useChannels } from "context/channels";
import { isNull } from "es-toolkit";
import { isArray } from "es-toolkit/compat";
import {
  Dispatch,
  SetStateAction,
  startTransition,
  useEffect,
  useMemo,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { InferType } from "yup";

type AddTracking = InferType<typeof TrackingSchema>;

export default function TrackingForm({
  order,
  open,
  setOpen,
  setOptimisticOrder,
}: {
  order: Order;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setOptimisticOrder?: (action: Partial<Order>) => void;
}) {
  const { channel } = useChannels();
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const label = t("tracking.addTitle", {
    defaultValue: "Add Package Tracking",
  });
  const SchemaYupResolver = yupResolver(TrackingSchema);
  const methods = useForm({
    defaultValues: initialValues(),
    resolver: SchemaYupResolver,
  });
  const { control } = methods;
  const trackingNumber = useWatch({ control, name: "number" });
  useEffect(() => {
    if (trackingNumber && !isArray(trackingNumber)) {
      const courier = detectCourier(trackingNumber);
      if (!isNull(courier)) {
        methods.setValue("shippingOption", courier.shippingOption);
        methods.setValue("link", courier.link);
      }
    }
  }, [methods, trackingNumber]);

  useEffect(() => {
    if (open) {
      methods.reset(initialValues());
    }
  }, [methods, open]);

  const isInternalCourier = useMemo(
    () =>
      order &&
      (order.shippingOption === ShippingOptions.COMPANY_COURIER ||
        order.shippingOption === ShippingOptions.PERSONAL_COLLECTION),
    [order],
  );
  const hasTrackingData = useMemo(() => {
    if (!order) return false;
    const tracking = order.tracking;
    if (!tracking) return false;
    return Boolean(tracking.scans?.length || tracking.lastScan);
  }, [order]);

  if (isNull(channel)) return null;

  return (
    <CustomDialog header={label} open={open} setOpen={setOpen}>
      <VStack gap={4} align="stretch">
        {isInternalCourier && hasTrackingData && (
          <InternalCourierTrackingInfo order={order} t={t} />
        )}
        {!isInternalCourier && (
          <FormController
            methods={methods}
            buttonLeftIcon={"add"}
            buttonLabel={label}
            formData={trackingForm(t)}
            handleSubmit={async (data) =>
              await handleAddTracking(
                order,
                order.id,
                data,
                channel,
                t,
                setOpen,
                setOptimisticOrder,
                tenantContext,
              )
            }
            t={t}
            i18n={i18n}
          />
        )}
        {isInternalCourier && !hasTrackingData && (
          <Box p={4} textAlign="center">
            <Text color="gray.600">
              {t("tracking.internalCourierNoData", {
                defaultValue:
                  "Internal courier tracking data will appear here when available.",
              })}
            </Text>
          </Box>
        )}
      </VStack>
    </CustomDialog>
  );
}

const initialValues = () => {
  const values: AddTracking = {
    number: "",
    shippingOption: ShippingOptions.DHL,
    link: "",
  };
  return values;
};

interface InternalCourierTrackingInfoProps {
  order: Order;
  t: any;
}

const InternalCourierTrackingInfo = ({
  order,
  t,
}: InternalCourierTrackingInfoProps) => {
  const { tracking } = order;

  if (!tracking) return null;

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp?.toDate) return null;
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(timestamp.toDate());
  };

  const getScanStageIcon = (stage: string) => {
    switch (stage) {
      case "PICKUP":
        return "local_shipping";
      case "DELIVERY":
        return "home";
      default:
        return "location_on";
    }
  };

  const getScanStageLabel = (stage: string) => {
    switch (stage) {
      case "PICKUP":
        return t("TrackingScanStage.PICKUP", {
          defaultValue: "Picked up by courier",
        });
      case "DELIVERY":
        return t("TrackingScanStage.DELIVERY", { defaultValue: "Delivered" });
      default:
        return t("TrackingScanStage.OTHER", { defaultValue: "In transit" });
    }
  };

  return (
    <Box p={4} borderWidth={1} borderRadius="xl">
      <Text fontWeight="bold" mb={3}>
        {t("tracking.internalCourierInfo", {
          defaultValue:
            "This order is being delivered by our internal courier. Tracking information will be updated as the delivery progresses.",
        })}
      </Text>

      <VStack gap={3} align="stretch">
        {/* Summary Information */}
        <HStack justify="space-between">
          <VStack align="start" gap={1}>
            {tracking.pickupAt && (
              <>
                <Text fontSize="sm" color="gray.600">
                  {t("tracking.pickedUpAt", { defaultValue: "Picked up at" })}
                </Text>
                <Text fontSize="sm" fontWeight="medium">
                  {formatTimestamp(tracking.pickupAt)}
                </Text>
              </>
            )}
          </VStack>
          <VStack align="end" gap={1}>
            {tracking.deliveredAt && (
              <>
                <Text fontSize="sm" color="gray.600">
                  {t("tracking.deliveredAt", { defaultValue: "Delivered at" })}
                </Text>
                <Text fontSize="sm" fontWeight="medium">
                  {formatTimestamp(tracking.deliveredAt)}
                </Text>
              </>
            )}
          </VStack>
        </HStack>

        {/* Last Scan Information */}
        {tracking.lastScan && (
          <>
            <Separator />
            <VStack align="stretch" gap={2}>
              <HStack>
                <Text fontSize="sm" fontWeight="semibold">
                  {t("tracking.currentStatus", {
                    defaultValue: "Current Status",
                  })}
                </Text>
                <Badge colorPalette="blue" size="sm">
                  {getScanStageLabel(tracking.lastScan.stage)}
                </Badge>
              </HStack>
              <HStack gap={3}>
                <MaterialSymbol color="primary.solid">
                  {getScanStageIcon(tracking.lastScan.stage)}
                </MaterialSymbol>
                <VStack align="start" gap={1}>
                  <Text fontSize="xs" color="gray.solid">
                    {formatTimestamp(tracking.lastScan.scannedAt)}
                  </Text>
                </VStack>
              </HStack>
            </VStack>
          </>
        )}

        {/* Recent Scans */}
        {tracking.scans && tracking.scans.length > 0 && (
          <>
            <Separator />
            <VStack align="stretch" gap={2}>
              <HStack>
                <Text fontSize="sm" fontWeight="semibold">
                  {t("tracking.recentActivity", {
                    defaultValue: "Recent Activity",
                  })}{" "}
                  ({tracking.scans.length})
                </Text>
              </HStack>
              <VStack gap={2} maxHeight="200px" overflowY="auto">
                {tracking.scans
                  .slice(0, 5)
                  .map((scan: TrackingScan, index: number) => (
                    <HStack key={scan.id} gap={3} p={2} borderRadius="xl">
                      <MaterialSymbol color="gray.solid">
                        {getScanStageIcon(scan.stage)}
                      </MaterialSymbol>
                      <VStack align="start" gap={0} flex={1}>
                        <Text fontSize="xs" fontWeight="medium">
                          {getScanStageLabel(scan.stage)}
                        </Text>
                        <Text fontSize="xs" color="gray.solid">
                          {formatTimestamp(scan.scannedAt)}
                        </Text>
                        {scan.by && (
                          <Text fontSize="xs" color="gray.solid">
                            {scan.by}
                          </Text>
                        )}
                      </VStack>
                    </HStack>
                  ))}
              </VStack>
            </VStack>
          </>
        )}
      </VStack>
    </Box>
  );
};

async function handleAddTracking(
  order: Order,
  orderId: Order["id"],
  data: AddTracking,
  channel: Channel,
  t: any,
  setOpen: Dispatch<SetStateAction<boolean>>,
  setOptimisticOrder?: (action: Partial<Order>) => void,
  tenantContext?: TenantContext,
) {
  const prevTrackingState: Order["tracking"] | undefined = order.tracking;
  try {
    const tracking = {
      number: data.number,
      shippingOption: data.shippingOption,
      link: data.link,
    };
    const _data: OrderAddTracking = {
      tracking: tracking,
    };

    // Optimistically update the parent order state and store previous
    if (setOptimisticOrder) {
      startTransition(() => {
        setOptimisticOrder({ tracking });
      });
    }
    await update(
      _data,
      db.doc(firestore, `channels/${channel.id}/orders`, `${orderId}`),
      tenantContext,
    );
    toaster.success({
      title: t("tracking.added", { defaultValue: "Package tracking added" }),
      description: t("tracking.added_description", {
        defaultValue: "Successfully added package tracking",
      }),
    });
    setOpen(false);
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("tracking.not_added", {
        defaultValue: "Failed to add package tracking, error code: {{error}}",
        error,
      }),
    });
    if (setOptimisticOrder && prevTrackingState) {
      startTransition(() => {
        setOptimisticOrder({ tracking: prevTrackingState });
      });
    }
  }
}
