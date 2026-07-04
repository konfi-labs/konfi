import useTaskDragAndDrop from "@/hooks/useOrderDragAndDrop";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  chakra,
  Collapsible,
  Flex,
  HStack,
  List,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  AlertDialog,
  ButtonLink,
  IconButtonLink,
  MaterialSymbol,
  MenuItem,
  MiddleTruncatedText,
} from "@konfi/components";
import { CurrencyEnum, Order } from "@konfi/types";
import {
  formatPrice,
  getDeadlineColorPalette,
  timeToDeadline,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useOrders } from "context/orders";
import dynamic from "next/dynamic";
import { startTransition, useState } from "react";

const OrderForm = dynamic(() => import("../orders/OrderForm"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const Menu = dynamic(() => import("../Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

type CardProps = {
  index: number;
  order: Order;
};

const Card = ({ index, order }: CardProps) => {
  const { t, i18n } = useT(["order", "orders", "translation"]);
  const { deactivateOrder } = useOrders();
  const { ref, isDragging } = useTaskDragAndDrop<HTMLDivElement>({
    order,
    index,
  });
  const { channel } = useChannels();
  const [open, setOpen] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const daysToDeadline = timeToDeadline(order.deadline.toDate());
  const deadlineColorPalette = getDeadlineColorPalette(order.deadline.toDate());

  function handleUpdateFormOpen(order: Order) {
    startTransition(() => {
      setCurrentOrder(order);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(order: Order) {
    startTransition(() => {
      setCurrentOrder(order);
      setShowDuplicateForm(true);
    });
  }

  function handleDeactivate(order: Order) {
    startTransition(() => {
      setCurrentOrder(order);
      setShowDeactivateDialog(true);
    });
  }

  return (
    <Box
      ref={ref}
      w={"100%"}
      role={"group"}
      position={"relative"}
      rounded={"2xl"}
      pl={"6"}
      pr={"6"}
      pt={"3"}
      pb={"3"}
      bgColor={{ base: "white", _dark: "gray.950" }}
      cursor={"grab"}
      shadow={"inset"}
      opacity={isDragging ? 0.5 : 1}
      transform={isDragging ? "translateY(-6px) scale(1.02)" : undefined}
      transition={
        "transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease, background-color 150ms ease, border-color 150ms ease"
      }
    >
      <VStack align={"start"}>
        <HStack w={"100%"} justifyContent={"space-between"}>
          <Text fontWeight={"600"} fontSize={"xl"}>
            {channel?.name}#{order.number}
          </Text>
          <Flex gap={"2"}>
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/orders/${order.id}`}
              icon={"open_in_new"}
              ariaLabel={t("orders.orderPreview", {
                defaultValue: "Order preview",
              })}
              tooltipLabel={t("orders.orderPreview", {
                defaultValue: "Order preview",
              })}
            />
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value={"update-form"}
                onClick={() => handleUpdateFormOpen(order)}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("orders.edit", { defaultValue: "Edit order" })}
              </MenuItem>
              <MenuItem
                value={"duplicate-form"}
                onClick={() => handleDuplicateFormOpen(order)}
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("orders.copy", { defaultValue: "Copy order" })}
              </MenuItem>
              <MenuItem
                value={"deactivate-modal"}
                onClick={() => handleDeactivate(order)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>block</MaterialSymbol>
                {t("orders.deactivate", { defaultValue: "Deactivate order" })}
              </MenuItem>
            </Menu>
          </Flex>
        </HStack>
        {typeof order?.customer === "object" ? (
          <>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              href={`/customers/${order?.customer.id}`}
              size={"2xs"}
              ariaLabel={t("orders.openInNewWindow", {
                defaultValue: "Open in new window",
              })}
              variant={"outline"}
              maxW="100%"
              justifyContent="flex-start"
              title={order.customer.name}
            >
              <HStack gap={2} minW={0} maxW="100%">
                <MiddleTruncatedText
                  value={order.customer.name ?? ""}
                  flex="1"
                />
                <MaterialSymbol p={0} flexShrink={0}>
                  open_in_new
                </MaterialSymbol>
              </HStack>
            </ButtonLink>
          </>
        ) : (
          <Text mb={"2"}>{order?.customer}</Text>
        )}
        <HStack w={"100%"}>
          <Badge colorPalette={deadlineColorPalette} variant={"subtle"}>
            {order.deadline.toDate().toLocaleDateString(i18n.resolvedLanguage, {
              weekday: "short",
              day: "2-digit",
              month: "short",
            })}
          </Badge>
          {daysToDeadline > 0 && (
            <Badge>
              <MaterialSymbol p={0}>schedule</MaterialSymbol>
              {t("common.daysWithCount", {
                defaultValue: "{{count}} days",
                count: daysToDeadline,
              })}
            </Badge>
          )}
          <Badge
            colorPalette={order.priority === 1 ? "purple" : "red"}
            hidden={order.priority === 2}
            pr={3}
            variant={
              order.priority === 1
                ? "outline"
                : order.priority === 2
                  ? undefined
                  : "subtle"
            }
          >
            <MaterialSymbol p={0}>priority_high</MaterialSymbol>
            {order.priority === 1
              ? t("order.later", { defaultValue: "LATER" })
              : t("order.urgent", { defaultValue: "URGENT" })}
          </Badge>
          <Text ml={"auto"} fontWeight={"600"} fontSize={"xl"}>
            {formatPrice(
              order.totalPrice,
              CurrencyEnum.PLN,
              undefined,
              undefined,
              i18n.resolvedLanguage,
            )}
          </Text>
        </HStack>
        {order.specialNotes && (
          <Text fontSize={"xs"}>{order.specialNotes}</Text>
        )}
        <Collapsible.Root
          lazyMount
          w={"100%"}
          onOpenChange={({ open }) => setOpen(open)}
        >
          <Collapsible.Trigger asChild>
            <HStack justifyContent={"space-between"}>
              <Button w={"100%"} size={"2xs"} variant={"subtle"}>
                {t("products.heading", { defaultValue: "Products" })}
                <MaterialSymbol>
                  {open ? "unfold_less" : "unfold_more"}
                </MaterialSymbol>
              </Button>
            </HStack>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <List.Root pt={"2"} variant={"plain"}>
              {order.items?.map((item, index) => (
                <List.Item
                  key={index}
                  mb={
                    order.items.length > 1 && index !== order.items.length - 1
                      ? "2"
                      : undefined
                  }
                >
                  <Box>
                    <HStack>
                      <Text
                        fontWeight={"600"}
                        textOverflow={"ellipsis"}
                        whiteSpace={"nowrap"}
                        overflow={"hidden"}
                      >
                        {item.product?.name}{" "}
                        <chakra.span>
                          {item.volume ? item.volume : item.quantity}{" "}
                          {t(`Unit.${item.unit}`, { defaultValue: item.unit })}
                        </chakra.span>
                      </Text>
                    </HStack>
                    {item.description && (
                      <Text
                        fontSize={"xs"}
                        color={{ base: "gray.500", _dark: "gray.400" }}
                      >
                        {item.description}
                      </Text>
                    )}
                  </Box>
                </List.Item>
              ))}
            </List.Root>
          </Collapsible.Content>
        </Collapsible.Root>
      </VStack>
      {showUpdateForm && (
        <OrderForm
          order={currentOrder!}
          asDrawer
          type={"UPDATE"}
          open={showUpdateForm}
          setOpen={setShowUpdateForm}
        />
      )}
      {showDuplicateForm && (
        <OrderForm
          order={currentOrder!}
          asDrawer
          type={"DUPLICATE"}
          open={showDuplicateForm}
          setOpen={setShowDuplicateForm}
        />
      )}
      <AlertDialog
        header={t("orders.confirmDeactivateOrder", {
          defaultValue: "Are you sure you want to deactivate the order?",
        })}
        handle={() => deactivateOrder(order.id)}
        open={showDeactivateDialog}
        setOpen={setShowDeactivateDialog}
        t={t}
      >
        <Text>
          {t("orders.deactivateOrderDescription", {
            defaultValue:
              "After deactivation, the order will only be visible under the filter - inactive.",
          })}
        </Text>
      </AlertDialog>
    </Box>
  );
};

export default Card;
