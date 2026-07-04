import { useT } from "@/i18n/client";
import { Button, MenuSeparator } from "@chakra-ui/react";
import {
  MaterialSymbol,
  MenuContent,
  MenuItem,
  MenuItemGroup,
  MenuItemLink,
  MenuRoot,
  MenuTrigger,
} from "@konfi/components";
import { Customer } from "@konfi/types";
import {
  ACCOUNT_SETTINGS,
  STORE_ACCOUNT,
  STORE_ACCOUNT_ORDERS,
} from "@konfi/utils";

interface Props {
  email: string | null;
  customer: Customer | null;
  logout: () => void;
  lng: string;
  [x: string]: any;
}

export default function ProfileMenu({
  email,
  customer,
  logout,
  lng,
  ...rest
}: Props) {
  const { t } = useT();

  return (
    <MenuRoot lazyMount>
      <MenuTrigger
        asChild
        title={t("profile.myAccount", { defaultValue: "My Account", lng })}
      >
        <Button
          mr={4}
          rounded={"full"}
          aria-label="Profile"
          colorPalette="primary"
          {...rest}
        >
          {t("profile.myAccount", { defaultValue: "My Account", lng })}
          <MaterialSymbol>person</MaterialSymbol>
        </Button>
      </MenuTrigger>
      <MenuContent
        border={"1px solid"}
        borderColor={{ base: "whiteAlpha.500", _dark: "whiteAlpha.200" }}
        zIndex={9999}
      >
        <MenuItemGroup title={email ? email : ""}>
          <MenuItemLink
            lng={lng}
            href={STORE_ACCOUNT}
            value={"account"}
            rel={"nofollow"}
          >
            {t("profile.account", { defaultValue: "Account", lng })}
          </MenuItemLink>
          <MenuItemLink
            lng={lng}
            href={STORE_ACCOUNT_ORDERS}
            value={"orders"}
            rel={"nofollow"}
          >
            {t("profile.orders", { defaultValue: "Orders", lng })}
          </MenuItemLink>
          <MenuItemLink
            lng={lng}
            href={ACCOUNT_SETTINGS}
            value={"settings"}
            rel={"nofollow"}
          >
            {t("profile.settings", { defaultValue: "Settings", lng })}
          </MenuItemLink>
        </MenuItemGroup>
        <MenuSeparator />
        <MenuItemGroup
          title={
            customer?.discount
              ? t("profile.yourDiscount", {
                defaultValue: "YOUR DISCOUNT: {{discount}}%",
                discount: customer.discount,
                lng,
              })
              : undefined
          }
        >
          <MenuItem
            value={"logout"}
            bg={"transparent"}
            _hover={{ bg: { base: "blackAlpha.100", _dark: "whiteAlpha.100" } }}
            onClick={logout}
          >
            {t("profile.logout", { defaultValue: "Logout", lng })}
          </MenuItem>
        </MenuItemGroup>
      </MenuContent>
    </MenuRoot>
  );
}
