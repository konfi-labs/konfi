"use client";

import {
  Button,
  Collapsible,
  Separator,
  Text,
  TimelineTitle,
  useDisclosure,
} from "@chakra-ui/react";
import {
  IActivity,
  isOrderFilesStatus,
  isOrderStatus,
  isPaymentStatus,
} from "@konfi/types";
import { formatDate } from "@konfi/utils";
import { TFunction } from "i18next";
import {
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineItem,
  TimelineRoot,
} from "../../ui/timeline";
import { MaterialSymbol } from "../MaterialSymbol";

interface Props {
  activities: IActivity[];
  lng?: string;
  t: TFunction;
}

export function Activity({ activities, lng = "pl", t }: Props) {
  const { open, onClose, onOpen } = useDisclosure();

  return (
    <>
      <Text as="h2" fontSize="lg" fontWeight="bold">
        {t("orderPage.activity.heading", { defaultValue: "Activity" })}
      </Text>
      <Separator my={"4"} />
      {activities.length < 3 ? (
        <Activites activities={activities} lng={lng} t={t} />
      ) : (
        <Collapsible.Root lazyMount>
          <Collapsible.Trigger asChild>
            <Button
              mb={open ? "6" : undefined}
              pr={"8"}
              onClick={open ? onClose : onOpen}
              colorPalette={"primary"}
            >
              <MaterialSymbol>
                {open ? "expand_less" : "expand_more"}
              </MaterialSymbol>
              {open
                ? t("orderPage.activity.collapse", { defaultValue: "Collapse" })
                : t("orderPage.activity.expand", { defaultValue: "Expand" })}
            </Button>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <Activites activities={activities} lng={lng} t={t} />
          </Collapsible.Content>
        </Collapsible.Root>
      )}
    </>
  );
}

function Activites({
  activities,
  lng,
  t,
}: {
  activities: IActivity[];
  lng: string;
  t: (key: string) => string;
}) {
  function formatActivity(
    type: IActivity["type"],
    value: IActivity["value"],
    metadata?: IActivity["metadata"],
  ): string {
    let result: string = "";
    if (type === "ORDER_STATUS_UPDATE") {
      result += t(`ActivityStatus.${type}`);
      result += ": ";
      result += isOrderStatus(value) ? t(`OrderStatus.${value}`) : "";
    } else if (type === "PAYMENT_STATUS_UPDATE") {
      result += t(`ActivityStatus.${type}`);
      result += ": ";
      result += isPaymentStatus(value) ? t(`PaymentStatus.${value}`) : "";
    } else if (type === "FILES_STATUS_UPDATE") {
      result += t(`ActivityStatus.${type}`);
      result += ": ";
      result += isOrderFilesStatus(value) ? t(`OrderFilesStatus.${value}`) : "";
    } else if (type === "PAYMENT_METHOD_CHANGED") {
      result += t(`ActivityStatus.${type}`);
      if (metadata?.before && metadata?.after) {
        result += ": ";
        result += t(`PaymentType.${metadata.before}`);
        result += " → ";
        result += t(`PaymentType.${metadata.after}`);
      }
    } else if (String(type) === "TRACKING_SCAN") {
      result += t(`ActivityStatus.${type}`);
      if (metadata?.stage) {
        result += ": ";
        result += t(`TrackingScanStage.${String(metadata.stage)}`);
      }
    } else if (type === "EMAIL_SENT") {
      result += t(`ActivityStatus.${type}`);
      if (process.env.NODE_ENV === "development") {
        console.log(metadata);
      }
      if (metadata?.to) {
        result += " ";
        result += metadata.to;
      }
      if (metadata?.subject) {
        result += " - ";
        result += metadata.subject;
      }
    } else if (type === "ORDER_PRINTED") {
      result += t(`ActivityStatus.${type}`);
    }

    return result;
  }

  return (
    <TimelineRoot
      size={"lg"}
      colorPalette={"primary"}
      maxH={"500px"}
      overflowY={"auto"}
    >
      {activities.map((activity, index) => (
        <TimelineItem key={index}>
          <TimelineConnector>
            <MaterialSymbol>
              {activity.type === "EMAIL_SENT"
                ? "email"
                : activity.type === "ORDER_STATUS_UPDATE"
                  ? "shopping_cart"
                  : activity.type === "PAYMENT_STATUS_UPDATE"
                    ? "payment"
                    : activity.type === "PAYMENT_METHOD_CHANGED"
                      ? "edit"
                      : activity.type === "FILES_STATUS_UPDATE"
                        ? "folder"
                        : activity.type === "TRACKING_SCAN"
                          ? "qr_code_scanner"
                          : activity.type === "ORDER_PRINTED"
                            ? "print"
                            : "update"}
            </MaterialSymbol>
          </TimelineConnector>
          <TimelineContent>
            <TimelineTitle>
              {t(`ActivityStatusShort.${activity.type}`)}
            </TimelineTitle>
            <TimelineDescription>
              {formatDate(activity.timestamp, lng, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </TimelineDescription>
            <Text textStyle={"sm"}>
              {formatActivity(activity.type, activity.value, activity.metadata)}
            </Text>
          </TimelineContent>
        </TimelineItem>
      ))}
    </TimelineRoot>
  );
}
