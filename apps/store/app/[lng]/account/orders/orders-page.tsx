"use client";

import { Spinner } from "@chakra-ui/react";
import { useAuth } from "@/context/auth";
import { Order } from "@konfi/types";
import OrderCard from "app/[lng]/components/order/OrderCard";
import { useOrders } from "@/context/orders";
import { isNull } from "es-toolkit";
import { CustomHeading } from "@konfi/components";
import { Empty } from "@konfi/components";
import { VStack } from "@chakra-ui/react";
import { useT } from "@/i18n/client";

const OrdersPage = () => {
  const { t } = useT();
  const { loading: loadingAuth } = useAuth();
  const { loadingOrders, orders, isEmpty } = useOrders();

  if (loadingOrders || loadingAuth) {
    return (
      <>
        <CustomHeading
          heading={t("common.orders", { defaultValue: "Orders" })}
          mb={8}
        />
        <Spinner color="primary.solid" />
      </>
    );
  }

  if (isEmpty || isNull(orders)) {
    return (
      <Empty
        title={t("common.noOrders", { defaultValue: "No orders" })}
        description={t("common.noOrdersDescription", {
          defaultValue: "You don't have any orders at the moment.",
        })}
        icon={"orders"}
      />
    );
  }

  return (
    <>
      <CustomHeading
        heading={t("common.orders", { defaultValue: "Orders" })}
        mb={8}
      />
      <VStack gap={8}>
        {orders.map((order: Order, index) => (
          <OrderCard key={index} order={order} />
        ))}
      </VStack>
    </>
  );
};

export default OrdersPage;
