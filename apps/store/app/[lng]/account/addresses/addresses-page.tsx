"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { Box, Heading, SimpleGrid, Text } from "@chakra-ui/react";
import { CustomHeading, Empty } from "@konfi/components";
import { Address, Customer } from "@konfi/types";
import Loader from "app/[lng]/components/Loader";
import { isNull, isUndefined } from "es-toolkit";
import { useEffect, useState } from "react";

const AddressesPage = () => {
  const { t } = useT();
  const [addresses, setAddresses] = useState<Customer["addresses"]>([]);
  const { loading, customer } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isNull(customer)) return;
    setAddresses(customer.addresses);
  }, [customer, loading]);

  if (loading) {
    return (
      <Loader text={t("common.loading", { defaultValue: "Loading..." })} />
    );
  }

  return (
    <>
      <CustomHeading
        heading={t("common.addresses", { defaultValue: "Addresses" })}
        mb={"8"}
      />
      {!isUndefined(addresses) && addresses.length > 0 ? (
        <SimpleGrid columns={3} gap={6}>
          {addresses.map((address, index) => (
            <AddressCard key={index} address={address} />
          ))}
        </SimpleGrid>
      ) : (
        <Empty
          title={t("common.noAddresses", { defaultValue: "No addresses" })}
          description={t("common.noAddressesDescription", {
            defaultValue: "You don't have any saved addresses at the moment.",
          })}
          icon={"home"}
        />
      )}
    </>
  );
};

const AddressCard = ({ address }: { address: Address }) => {
  return (
    <Box
      p={4}
      borderRadius="3xl"
      border={"1px solid transparent"}
      borderColor={"blackAlpha.100"}
    >
      <Heading fontSize={"lg"} mb={2}>
        {address.name}
      </Heading>
      <Text>
        {address.street}
        <br />
        {address.zip}, {address.city}
      </Text>
    </Box>
  );
};

export default AddressesPage;
