import { useAuth } from "context/auth";
import { ACCOUNT_SETTINGS } from "@konfi/utils/routes";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { MenuItemLink } from "@konfi/components/shared/Link";
import {
  MenuContent,
  MenuItem,
  MenuItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@konfi/components/ui/menu";
import { IconButton, type IconButtonProps } from "@chakra-ui/react";
import { useT } from "@/i18n/client";

export default function ProfileMenu({
  email,
  ...rest
}: {
  email: string | null | undefined;
} & Omit<IconButtonProps, "aria-label" | "children">) {
  const { i18n } = useT();
  const { logout } = useAuth();

  return (
    <MenuRoot lazyMount>
      <MenuTrigger asChild mr={4} title={"Profil"}>
        <IconButton
          rounded={"full"}
          aria-label="Profile"
          variant="solid"
          colorPalette="primary"
          size={"sm"}
          {...rest}
        >
          <MaterialSymbol style={{ fontSize: 22 }}>person</MaterialSymbol>
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItemGroup title={email ? email : ""}></MenuItemGroup>
        <MenuSeparator />
        <MenuItemGroup>
          <MenuItemLink
            lng={i18n.resolvedLanguage}
            href={ACCOUNT_SETTINGS}
            value={"settings"}
          >
            <MaterialSymbol>settings</MaterialSymbol>
            Ustawienia
          </MenuItemLink>
          <MenuItem
            value={"logout"}
            bg={"transparent"}
            _hover={{
              bg: "blackAlpha.100",
            }}
            onClick={logout}
          >
            <MaterialSymbol>logout</MaterialSymbol>
            Wyloguj
          </MenuItem>
        </MenuItemGroup>
      </MenuContent>
    </MenuRoot>
  );
}
