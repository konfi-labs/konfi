import { IconButton } from "@chakra-ui/react";
import {
  ADMIN_CUSTOMERS,
  ADMIN_ORDERS_CREATE,
  ADMIN_QUOTES_CREATE,
} from "@konfi/utils/routes";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { MenuItemLink } from "@konfi/components/shared/Link";
import {
  MenuContent,
  MenuItemCommand,
  MenuItemGroup,
  MenuRoot,
  MenuTrigger,
} from "@konfi/components/ui/menu";
import { useT } from "@/i18n/client";

export default function NewMenu() {
  const { i18n } = useT();

  return (
    <MenuRoot lazyMount>
      <MenuTrigger title={"Nowe"} asChild>
        <IconButton
          rounded="full"
          aria-label="New"
          variant="solid"
          colorPalette="primary"
          size="sm"
        >
          <MaterialSymbol>add</MaterialSymbol>
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItemGroup>
          <MenuItemLink
            lng={i18n.resolvedLanguage}
            href={ADMIN_ORDERS_CREATE}
            value={"add_order"}
          >
            <MaterialSymbol>box_add</MaterialSymbol>
            Nowe Zamówienie
            <MenuItemCommand>Alt + 1</MenuItemCommand>
          </MenuItemLink>
          <MenuItemLink
            lng={i18n.resolvedLanguage}
            href={ADMIN_QUOTES_CREATE}
            value={"add_quote"}
          >
            <MaterialSymbol>note_add</MaterialSymbol>
            Nowa Oferta
            <MenuItemCommand>Alt + 2</MenuItemCommand>
          </MenuItemLink>
        </MenuItemGroup>
        <MenuItemGroup>
          <MenuItemLink
            lng={i18n.resolvedLanguage}
            href={ADMIN_CUSTOMERS + "?type=create-new"}
            value={"add_client"}
          >
            <MaterialSymbol>person_add</MaterialSymbol>
            Nowy Klient
            <MenuItemCommand>Alt + 3</MenuItemCommand>
          </MenuItemLink>
        </MenuItemGroup>
      </MenuContent>
    </MenuRoot>
  );
}
