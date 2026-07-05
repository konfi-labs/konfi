import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FormController, MaterialSymbol } from "@konfi/components";
import {
  AddressTypeEnum,
  CurrencyEnum,
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  PriceTypeEnum,
  ShippingOptions,
  ShippingTypes,
  ThreeDModels,
  Unit,
  type FormData,
  type SelectOption,
} from "@konfi/types";
import {
  categoryForm,
  customerForm,
  orderForm,
  productForm,
  storeSettingsForm,
} from "@konfi/utils";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { action } from "storybook/actions";
import type { TFunction, i18n as I18nextInstance } from "i18next";
import type { ComponentProps, ReactNode } from "react";
import { useMemo } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import csAllegro from "../../../admin/app/i18n/locales/cs/allegro.json";
import csOrder from "../../../admin/app/i18n/locales/cs/order.json";
import csOrders from "../../../admin/app/i18n/locales/cs/orders.json";
import csTranslation from "../../../admin/app/i18n/locales/cs/translation.json";
import deAllegro from "../../../admin/app/i18n/locales/de/allegro.json";
import deOrder from "../../../admin/app/i18n/locales/de/order.json";
import deOrders from "../../../admin/app/i18n/locales/de/orders.json";
import deTranslation from "../../../admin/app/i18n/locales/de/translation.json";
import enAllegro from "../../../admin/app/i18n/locales/en/allegro.json";
import enOrder from "../../../admin/app/i18n/locales/en/order.json";
import enOrders from "../../../admin/app/i18n/locales/en/orders.json";
import enTranslation from "../../../admin/app/i18n/locales/en/translation.json";
import frAllegro from "../../../admin/app/i18n/locales/fr/allegro.json";
import frOrder from "../../../admin/app/i18n/locales/fr/order.json";
import frOrders from "../../../admin/app/i18n/locales/fr/orders.json";
import frTranslation from "../../../admin/app/i18n/locales/fr/translation.json";
import plAllegro from "../../../admin/app/i18n/locales/pl/allegro.json";
import plOrder from "../../../admin/app/i18n/locales/pl/order.json";
import plOrders from "../../../admin/app/i18n/locales/pl/orders.json";
import plTranslation from "../../../admin/app/i18n/locales/pl/translation.json";
import skAllegro from "../../../admin/app/i18n/locales/sk/allegro.json";
import skOrder from "../../../admin/app/i18n/locales/sk/order.json";
import skOrders from "../../../admin/app/i18n/locales/sk/orders.json";
import skTranslation from "../../../admin/app/i18n/locales/sk/translation.json";
import ukAllegro from "../../../admin/app/i18n/locales/uk/allegro.json";
import ukOrder from "../../../admin/app/i18n/locales/uk/order.json";
import ukOrders from "../../../admin/app/i18n/locales/uk/orders.json";
import ukTranslation from "../../../admin/app/i18n/locales/uk/translation.json";

const meta = {
  title: "Admin/Docs Examples",
  parameters: {
    appTheme: "admin",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type StoryLocale = "cs" | "de" | "en" | "fr" | "pl" | "sk" | "uk";
type ResourceRecord = Record<string, unknown>;
type TranslationOptions = {
  defaultValue?: unknown;
  ns?: unknown;
  count?: unknown;
  [key: string]: unknown;
};
type FormControllerProps = ComponentProps<typeof FormController>;
type ProductGroupedIndexedSearchProps = Parameters<
  NonNullable<FormControllerProps["ProductGroupedIndexedSearch"]>
>[0];
type CombinationInputProps = Parameters<
  NonNullable<FormControllerProps["CombinationInput"]>
>[0];
type StoryKey = "category" | "customer" | "order" | "product" | "settings";
type StoryCopy = {
  buttonLabel: string;
  description: string;
  mode: string;
  title: string;
};
type StoryLocaleData = {
  category: {
    description: string;
    name: string;
    seoDescription: string;
    seoTitle: string;
    slug: string;
  };
  categories: { id: string; name: string }[];
  combination: {
    finishing: string;
    finishingValue: string;
    firstQuantity: string;
    paper: string;
    paperValue: string;
    quantity: string;
    secondQuantity: string;
  };
  customer: {
    billingName: string;
    country: string;
    groupLabel: string;
    shippingName: string;
    specialNotes: string;
  };
  order: {
    specialNotes: string;
  };
  product: {
    customItemName: string;
    description: string;
    linkedLabel: string;
    name: string;
    seoDescription: string;
    seoTitle: string;
    slug: string;
    specialNotes: string;
  };
  shell: Record<StoryKey, StoryCopy>;
};

const resources = {
  cs: [csTranslation, csOrder, csOrders, csAllegro] as ResourceRecord[],
  de: [deTranslation, deOrder, deOrders, deAllegro] as ResourceRecord[],
  en: [enTranslation, enOrder, enOrders, enAllegro] as ResourceRecord[],
  fr: [frTranslation, frOrder, frOrders, frAllegro] as ResourceRecord[],
  pl: [plTranslation, plOrder, plOrders, plAllegro] as ResourceRecord[],
  sk: [skTranslation, skOrder, skOrders, skAllegro] as ResourceRecord[],
  uk: [ukTranslation, ukOrder, ukOrders, ukAllegro] as ResourceRecord[],
} satisfies Record<StoryLocale, ResourceRecord[]>;

const storyMembers = [
  { label: "Anna Nowak", value: "Anna Nowak" },
  { label: "Marek Zieliński", value: "Marek Zieliński" },
] satisfies SelectOption[];

const storyLocaleData = {
  cs: {
    category: {
      description:
        "Vizitky, složky a malé firemní tiskoviny pro opakované firemní objednávky.",
      name: "Firemní materiály",
      seoDescription:
        "Objednejte firemní tiskoviny s výrobními možnostmi Konfi.",
      seoTitle: "Tisk firemních materiálů",
      slug: "firemni-materialy",
    },
    categories: [
      { id: "printed-materials", name: "Tiskoviny" },
      { id: "business-materials", name: "Firemní materiály" },
      { id: "cards", name: "Vizitky" },
    ],
    combination: {
      finishing: "Dokončení",
      finishingValue: "Matný laminát",
      firstQuantity: "1 000 ks",
      paper: "Papír",
      paperValue: "350 g hedvábný",
      quantity: "Množství",
      secondQuantity: "500 ks",
    },
    customer: {
      billingName: "Fakturace",
      country: "Polsko",
      groupLabel: "B2B priorita",
      shippingName: "Hlavní kancelář",
      specialNotes:
        "Ve výchozím nastavení používejte matný laminát. Před opakovanými objednávkami potvrďte právní patičku.",
    },
    order: {
      specialNotes:
        "Opakovaná objednávka. Před schválením výroby potvrďte velikost právní patičky.",
    },
    product: {
      customItemName: "Vlastní položka dodavatele",
      description:
        "Prémiové vizitky s matným laminátem připravené pro opakované B2B objednávky.",
      linkedLabel: "propojeno",
      name: "Prémiové vizitky",
      seoDescription: "Objednejte prémiové laminované vizitky.",
      seoTitle: "Prémiové vizitky",
      slug: "premiove-vizitky",
      specialNotes: "Před expresními objednávkami potvrďte sklad papíru.",
    },
    shell: {
      category: {
        buttonLabel: "Vytvořit kategorii",
        description:
          "Struktura kategorie a pole SEO používají stejný dialogový formulář jako katalog v administraci.",
        mode: "Dialog katalogu",
        title: "Vytvořit kategorii",
      },
      customer: {
        buttonLabel: "Vytvořit zákazníka",
        description:
          "Fakturační údaje, platební oprávnění, poznámky, adresy a kontakty renderované adminovým FormControllerem.",
        mode: "Panel zákazníka",
        title: "Vytvořit zákazníka",
      },
      order: {
        buttonLabel: "Vytvořit objednávku",
        description:
          "Stejný sekční formulář objednávky, který operátoři používají pro zákazníka, kontakt, produkt, termín, dopravu, platbu a výrobu.",
        mode: "Formulář objednávky",
        title: "Vytvořit objednávku",
      },
      product: {
        buttonLabel: "Vytvořit produkt",
        description:
          "Bezpečný náhled formuláře produktu pro dokumentaci, založený na skutečných sekcích a ovládacích prvcích administrace.",
        mode: "Formulář katalogu",
        title: "Vytvořit produkt",
      },
      settings: {
        buttonLabel: "Upravit nastavení obchodu",
        description:
          "Nastavení obchodu pro kanál používají stejné generované konfigurační sekce jako stránka administrace.",
        mode: "Formulář konfigurace",
        title: "Upravit nastavení obchodu",
      },
    },
  },
  de: {
    category: {
      description:
        "Karten, Mappen und kleinformatige Druckprodukte für wiederkehrende Firmenaufträge.",
      name: "Geschäftsmaterialien",
      seoDescription:
        "Bestellen Sie Unternehmensdrucksachen mit Konfi-Produktionsoptionen.",
      seoTitle: "Druck von Geschäftsmaterialien",
      slug: "geschaeftsmaterialien",
    },
    categories: [
      { id: "printed-materials", name: "Drucksachen" },
      { id: "business-materials", name: "Geschäftsmaterialien" },
      { id: "cards", name: "Visitenkarten" },
    ],
    combination: {
      finishing: "Veredelung",
      finishingValue: "Matte Laminierung",
      firstQuantity: "1.000 Stk.",
      paper: "Papier",
      paperValue: "350 g Silk",
      quantity: "Menge",
      secondQuantity: "500 Stk.",
    },
    customer: {
      billingName: "Rechnung",
      country: "Polen",
      groupLabel: "B2B-Priorität",
      shippingName: "Hauptbüro",
      specialNotes:
        "Standardmäßig matte Laminierung verwenden. Rechtlichen Footer vor Folgeaufträgen bestätigen.",
    },
    order: {
      specialNotes:
        "Folgeauftrag. Größe des rechtlichen Footers vor Produktionsfreigabe bestätigen.",
    },
    product: {
      customItemName: "Eigener Lieferantenartikel",
      description:
        "Premium-Visitenkarten mit matter Laminierung, vorbereitet für wiederkehrende B2B-Aufträge.",
      linkedLabel: "verknüpft",
      name: "Premium-Visitenkarten",
      seoDescription: "Premium laminierte Visitenkarten bestellen.",
      seoTitle: "Premium-Visitenkarten",
      slug: "premium-visitenkarten",
      specialNotes: "Papierbestand vor Expressaufträgen bestätigen.",
    },
    shell: {
      category: {
        buttonLabel: "Kategorie erstellen",
        description:
          "Kategoriestruktur und SEO-Felder nutzen dasselbe Dialogformular wie der Katalog in der Administration.",
        mode: "Katalogdialog",
        title: "Kategorie erstellen",
      },
      customer: {
        buttonLabel: "Kunde erstellen",
        description:
          "Rechnungsdaten, Zahlungsberechtigungen, Notizen, Adressen und Kontakte werden mit dem Admin-FormController gerendert.",
        mode: "Kundenbereich",
        title: "Kunde erstellen",
      },
      order: {
        buttonLabel: "Auftrag erstellen",
        description:
          "Dasselbe gegliederte Auftragsformular, das Operatoren für Kunde, Kontakt, Produkt, Termin, Versand, Zahlung und Produktion verwenden.",
        mode: "Auftragsformular",
        title: "Auftrag erstellen",
      },
      product: {
        buttonLabel: "Produkt erstellen",
        description:
          "Eine dokumentationssichere Vorschau des Produktformulars mit den echten Admin-Abschnitten und Feldsteuerungen.",
        mode: "Katalogformular",
        title: "Produkt erstellen",
      },
      settings: {
        buttonLabel: "Shop-Einstellungen bearbeiten",
        description:
          "Channel-Storefront-Einstellungen verwenden dieselben generierten Konfigurationsabschnitte wie die Admin-Einstellungsseite.",
        mode: "Konfigurationsformular",
        title: "Shop-Einstellungen bearbeiten",
      },
    },
  },
  en: {
    category: {
      description:
        "Cards, folders, and small-format business print products for recurring company orders.",
      name: "Business materials",
      seoDescription:
        "Order company print materials with Konfi production options.",
      seoTitle: "Business materials printing",
      slug: "business-materials",
    },
    categories: [
      { id: "printed-materials", name: "Printed materials" },
      { id: "business-materials", name: "Business materials" },
      { id: "cards", name: "Cards" },
    ],
    combination: {
      finishing: "Finishing",
      finishingValue: "Matte laminate",
      firstQuantity: "1,000 pcs.",
      paper: "Paper",
      paperValue: "350 g silk",
      quantity: "Quantity",
      secondQuantity: "500 pcs.",
    },
    customer: {
      billingName: "Billing",
      country: "Poland",
      groupLabel: "B2B priority",
      shippingName: "Main office",
      specialNotes:
        "Use matte laminate by default. Confirm the legal footer before repeat orders.",
    },
    order: {
      specialNotes:
        "Repeat order. Confirm legal footer size before approving production.",
    },
    product: {
      customItemName: "Custom supplier item",
      description:
        "Premium business cards with matte laminate, prepared for recurring B2B orders.",
      linkedLabel: "linked",
      name: "Premium business cards",
      seoDescription: "Order premium laminated business cards.",
      seoTitle: "Premium business cards",
      slug: "premium-business-cards",
      specialNotes: "Confirm paper stock before express orders.",
    },
    shell: {
      category: {
        buttonLabel: "Create Category",
        description:
          "Category structure and SEO fields follow the same catalog dialog form used in the admin app.",
        mode: "Catalog dialog",
        title: "Create Category",
      },
      customer: {
        buttonLabel: "Create Customer",
        description:
          "Customer billing, payment permissions, notes, addresses, and contacts rendered with the admin FormController.",
        mode: "Customer drawer",
        title: "Create Customer",
      },
      order: {
        buttonLabel: "Create Order",
        description:
          "The same sectioned order form operators use for customer, contact, product, deadline, shipping, payment, and production assignment.",
        mode: "Order form",
        title: "Create Order",
      },
      product: {
        buttonLabel: "Create Product",
        description:
          "A docs-safe product form preview using the actual admin product form sections and field controllers.",
        mode: "Catalog form",
        title: "Create Product",
      },
      settings: {
        buttonLabel: "Update Store Settings",
        description:
          "Channel storefront settings use the same generated configuration sections as the admin settings page.",
        mode: "Configuration form",
        title: "Update Store Settings",
      },
    },
  },
  fr: {
    category: {
      description:
        "Cartes, chemises et petits imprimés professionnels pour commandes d'entreprise récurrentes.",
      name: "Supports professionnels",
      seoDescription:
        "Commandez des supports imprimés d'entreprise avec les options de production Konfi.",
      seoTitle: "Impression de supports professionnels",
      slug: "supports-professionnels",
    },
    categories: [
      { id: "printed-materials", name: "Supports imprimés" },
      { id: "business-materials", name: "Supports professionnels" },
      { id: "cards", name: "Cartes" },
    ],
    combination: {
      finishing: "Finition",
      finishingValue: "Pelliculage mat",
      firstQuantity: "1 000 pcs",
      paper: "Papier",
      paperValue: "350 g couché",
      quantity: "Quantité",
      secondQuantity: "500 pcs",
    },
    customer: {
      billingName: "Facturation",
      country: "Pologne",
      groupLabel: "Priorité B2B",
      shippingName: "Bureau principal",
      specialNotes:
        "Utiliser le pelliculage mat par défaut. Confirmer le pied légal avant les commandes récurrentes.",
    },
    order: {
      specialNotes:
        "Commande récurrente. Confirmer la taille du pied légal avant validation production.",
    },
    product: {
      customItemName: "Article fournisseur personnalisé",
      description:
        "Cartes de visite premium avec pelliculage mat, préparées pour les commandes B2B récurrentes.",
      linkedLabel: "lié",
      name: "Cartes de visite premium",
      seoDescription:
        "Commandez des cartes de visite premium avec pelliculage.",
      seoTitle: "Cartes de visite premium",
      slug: "cartes-visite-premium",
      specialNotes: "Confirmer le stock de papier avant les commandes express.",
    },
    shell: {
      category: {
        buttonLabel: "Créer une catégorie",
        description:
          "La structure de catégorie et les champs SEO utilisent le même formulaire de dialogue que le catalogue d'administration.",
        mode: "Dialogue catalogue",
        title: "Créer une catégorie",
      },
      customer: {
        buttonLabel: "Créer un client",
        description:
          "Données de facturation, autorisations de paiement, notes, adresses et contacts rendus avec le FormController admin.",
        mode: "Panneau client",
        title: "Créer un client",
      },
      order: {
        buttonLabel: "Créer une commande",
        description:
          "Le même formulaire de commande sectionné que les opérateurs utilisent pour client, contact, produit, délai, livraison, paiement et production.",
        mode: "Formulaire de commande",
        title: "Créer une commande",
      },
      product: {
        buttonLabel: "Créer un produit",
        description:
          "Un aperçu sûr pour la documentation du formulaire produit, basé sur les sections et contrôles réels de l'administration.",
        mode: "Formulaire catalogue",
        title: "Créer un produit",
      },
      settings: {
        buttonLabel: "Modifier les paramètres boutique",
        description:
          "Les paramètres de boutique du canal utilisent les mêmes sections de configuration générées que la page d'administration.",
        mode: "Formulaire de configuration",
        title: "Modifier les paramètres boutique",
      },
    },
  },
  pl: {
    category: {
      description:
        "Wizytówki, teczki i małoformatowe produkty drukowane dla powtarzalnych zamówień firmowych.",
      name: "Materiały biznesowe",
      seoDescription:
        "Zamów firmowe materiały drukowane z opcjami produkcyjnymi Konfi.",
      seoTitle: "Druk materiałów biznesowych",
      slug: "materialy-biznesowe",
    },
    categories: [
      { id: "printed-materials", name: "Materiały drukowane" },
      { id: "business-materials", name: "Materiały biznesowe" },
      { id: "cards", name: "Wizytówki" },
    ],
    combination: {
      finishing: "Uszlachetnienie",
      finishingValue: "Matowy laminat",
      firstQuantity: "1 000 szt.",
      paper: "Papier",
      paperValue: "350 g silk",
      quantity: "Nakład",
      secondQuantity: "500 szt.",
    },
    customer: {
      billingName: "Rozliczenie",
      country: "Polska",
      groupLabel: "Priorytet B2B",
      shippingName: "Biuro główne",
      specialNotes:
        "Domyślnie używaj matowego laminatu. Potwierdź stopkę prawną przed zamówieniami powtarzalnymi.",
    },
    order: {
      specialNotes:
        "Zamówienie powtarzalne. Potwierdź rozmiar stopki prawnej przed zatwierdzeniem produkcji.",
    },
    product: {
      customItemName: "Niestandardowa pozycja dostawcy",
      description:
        "Wizytówki premium z matowym laminatem, przygotowane dla powtarzalnych zamówień B2B.",
      linkedLabel: "połączono",
      name: "Wizytówki premium",
      seoDescription: "Zamów laminowane wizytówki premium.",
      seoTitle: "Wizytówki premium",
      slug: "wizytowki-premium",
      specialNotes: "Potwierdź papier przed zamówieniami ekspresowymi.",
    },
    shell: {
      category: {
        buttonLabel: "Utwórz kategorię",
        description:
          "Struktura kategorii i pola SEO korzystają z tego samego formularza dialogowego co katalog w panelu.",
        mode: "Dialog katalogu",
        title: "Utwórz kategorię",
      },
      customer: {
        buttonLabel: "Utwórz klienta",
        description:
          "Dane rozliczeniowe, uprawnienia płatności, notatki, adresy i kontakty renderowane przez adminowy FormController.",
        mode: "Panel klienta",
        title: "Utwórz klienta",
      },
      order: {
        buttonLabel: "Utwórz zamówienie",
        description:
          "Ten sam sekcyjny formularz zamówienia, którego operatorzy używają do klienta, kontaktu, produktu, terminu, dostawy, płatności i produkcji.",
        mode: "Formularz zamówienia",
        title: "Utwórz zamówienie",
      },
      product: {
        buttonLabel: "Utwórz produkt",
        description:
          "Bezpieczny dla dokumentacji podgląd formularza produktu, oparty o rzeczywiste sekcje i kontrolki panelu administracyjnego.",
        mode: "Formularz katalogu",
        title: "Utwórz produkt",
      },
      settings: {
        buttonLabel: "Edytuj ustawienia sklepu",
        description:
          "Ustawienia sklepu dla kanału używają tych samych wygenerowanych sekcji konfiguracji co strona administracyjna.",
        mode: "Formularz konfiguracji",
        title: "Edytuj ustawienia sklepu",
      },
    },
  },
  sk: {
    category: {
      description:
        "Vizitky, zakladače a maloformátové firemné tlačoviny pre opakované firemné objednávky.",
      name: "Firemné materiály",
      seoDescription:
        "Objednajte firemné tlačoviny s výrobnými možnosťami Konfi.",
      seoTitle: "Tlač firemných materiálov",
      slug: "firemne-materialy",
    },
    categories: [
      { id: "printed-materials", name: "Tlačoviny" },
      { id: "business-materials", name: "Firemné materiály" },
      { id: "cards", name: "Vizitky" },
    ],
    combination: {
      finishing: "Dokončenie",
      finishingValue: "Matný laminát",
      firstQuantity: "1 000 ks",
      paper: "Papier",
      paperValue: "350 g silk",
      quantity: "Množstvo",
      secondQuantity: "500 ks",
    },
    customer: {
      billingName: "Fakturácia",
      country: "Poľsko",
      groupLabel: "B2B priorita",
      shippingName: "Hlavná kancelária",
      specialNotes:
        "Predvolene používajte matný laminát. Pred opakovanými objednávkami potvrďte právnu pätu.",
    },
    order: {
      specialNotes:
        "Opakovaná objednávka. Pred schválením výroby potvrďte veľkosť právnej päty.",
    },
    product: {
      customItemName: "Vlastná položka dodávateľa",
      description:
        "Prémiové vizitky s matným laminátom pripravené pre opakované B2B objednávky.",
      linkedLabel: "prepojené",
      name: "Prémiové vizitky",
      seoDescription: "Objednajte prémiové laminované vizitky.",
      seoTitle: "Prémiové vizitky",
      slug: "premiove-vizitky",
      specialNotes: "Pred expresnými objednávkami potvrďte zásobu papiera.",
    },
    shell: {
      category: {
        buttonLabel: "Vytvoriť kategóriu",
        description:
          "Štruktúra kategórie a polia SEO používajú rovnaký dialógový formulár ako katalóg v administrácii.",
        mode: "Dialóg katalógu",
        title: "Vytvoriť kategóriu",
      },
      customer: {
        buttonLabel: "Vytvoriť zákazníka",
        description:
          "Fakturačné údaje, platobné oprávnenia, poznámky, adresy a kontakty renderované adminovým FormControllerom.",
        mode: "Panel zákazníka",
        title: "Vytvoriť zákazníka",
      },
      order: {
        buttonLabel: "Vytvoriť objednávku",
        description:
          "Rovnaký sekčný formulár objednávky, ktorý operátori používajú pre zákazníka, kontakt, produkt, termín, dopravu, platbu a výrobu.",
        mode: "Formulár objednávky",
        title: "Vytvoriť objednávku",
      },
      product: {
        buttonLabel: "Vytvoriť produkt",
        description:
          "Bezpečný náhľad formulára produktu pre dokumentáciu, založený na skutočných sekciách a ovládacích prvkoch administrácie.",
        mode: "Formulár katalógu",
        title: "Vytvoriť produkt",
      },
      settings: {
        buttonLabel: "Upraviť nastavenia obchodu",
        description:
          "Nastavenia obchodu pre kanál používajú rovnaké generované konfiguračné sekcie ako stránka administrácie.",
        mode: "Formulár konfigurácie",
        title: "Upraviť nastavenia obchodu",
      },
    },
  },
  uk: {
    category: {
      description:
        "Візитки, папки та малоформатна бізнес-поліграфія для повторних корпоративних замовлень.",
      name: "Бізнес-матеріали",
      seoDescription:
        "Замовляйте корпоративні друковані матеріали з виробничими опціями Konfi.",
      seoTitle: "Друк бізнес-матеріалів",
      slug: "biznes-materialy",
    },
    categories: [
      { id: "printed-materials", name: "Друковані матеріали" },
      { id: "business-materials", name: "Бізнес-матеріали" },
      { id: "cards", name: "Візитки" },
    ],
    combination: {
      finishing: "Оздоблення",
      finishingValue: "Матова ламінація",
      firstQuantity: "1 000 шт.",
      paper: "Папір",
      paperValue: "350 г silk",
      quantity: "Кількість",
      secondQuantity: "500 шт.",
    },
    customer: {
      billingName: "Рахунок",
      country: "Польща",
      groupLabel: "B2B-пріоритет",
      shippingName: "Головний офіс",
      specialNotes:
        "За замовчуванням використовуйте матову ламінацію. Підтвердьте юридичний футер перед повторними замовленнями.",
    },
    order: {
      specialNotes:
        "Повторне замовлення. Підтвердьте розмір юридичного футера перед погодженням виробництва.",
    },
    product: {
      customItemName: "Власна позиція постачальника",
      description:
        "Преміальні візитки з матовою ламінацією, підготовлені для повторних B2B-замовлень.",
      linkedLabel: "пов'язано",
      name: "Преміальні візитки",
      seoDescription: "Замовляйте преміальні ламіновані візитки.",
      seoTitle: "Преміальні візитки",
      slug: "premialni-vizytky",
      specialNotes: "Підтвердьте запас паперу перед експрес-замовленнями.",
    },
    shell: {
      category: {
        buttonLabel: "Створити категорію",
        description:
          "Структура категорії та SEO-поля використовують ту саму діалогову форму, що й каталог в адмініструванні.",
        mode: "Діалог каталогу",
        title: "Створити категорію",
      },
      customer: {
        buttonLabel: "Створити клієнта",
        description:
          "Платіжні дані, дозволи на оплату, нотатки, адреси й контакти відображаються через admin FormController.",
        mode: "Панель клієнта",
        title: "Створити клієнта",
      },
      order: {
        buttonLabel: "Створити замовлення",
        description:
          "Та сама секційна форма замовлення, яку оператори використовують для клієнта, контакту, продукту, строку, доставки, оплати та виробництва.",
        mode: "Форма замовлення",
        title: "Створити замовлення",
      },
      product: {
        buttonLabel: "Створити продукт",
        description:
          "Безпечний для документації перегляд форми продукту на основі реальних секцій і контролів адмінки.",
        mode: "Форма каталогу",
        title: "Створити продукт",
      },
      settings: {
        buttonLabel: "Редагувати налаштування магазину",
        description:
          "Налаштування вітрини каналу використовують ті самі згенеровані секції конфігурації, що й сторінка адміністрування.",
        mode: "Форма конфігурації",
        title: "Редагувати налаштування магазину",
      },
    },
  },
} satisfies Record<StoryLocale, StoryLocaleData>;

function readPath(resource: ResourceRecord, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as ResourceRecord)[segment];
  }, resource);
}

function humanizeKey(key: string) {
  const token = key.split(".").pop() ?? key;
  return token
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function interpolateTemplate(
  template: string,
  values: Record<string, unknown>,
) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, placeholder: string) =>
      String(values[placeholder] ?? ""),
    )
    .replace(/\{(\w+)\}/g, (_, placeholder: string) =>
      String(values[placeholder] ?? ""),
    );
}

function createStoryT(locale: StoryLocale) {
  const t = ((key: unknown, options?: TranslationOptions) => {
    const keys = Array.isArray(key) ? key.map(String) : [String(key)];
    const resolvedOptions =
      options && typeof options === "object" ? options : {};

    for (const candidate of keys) {
      for (const resource of resources[locale]) {
        const value = readPath(resource, candidate);

        if (typeof value === "string") {
          return interpolateTemplate(value, resolvedOptions);
        }
      }
    }

    if (typeof resolvedOptions.defaultValue === "string") {
      return interpolateTemplate(resolvedOptions.defaultValue, resolvedOptions);
    }

    return humanizeKey(keys[0] ?? "");
  }) as TFunction;

  return t;
}

function createStoryI18n(locale: StoryLocale) {
  return {
    language: locale,
    resolvedLanguage: locale,
  } as unknown as I18nextInstance;
}

function selectSections(formData: FormData, indexes: number[]): FormData {
  return {
    ...formData,
    sections: indexes.flatMap((index) => {
      const section = formData.sections[index];
      return section ? [section] : [];
    }),
  };
}

function withoutGeneratedMdxEditor(formData: FormData): FormData {
  return {
    ...formData,
    sections: formData.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.name === "description"
          ? {
              ...field,
              generate: undefined,
              mdxPreview: false,
            }
          : field,
      ),
    })),
  };
}

function FormStoryShell({
  children,
  description,
  mode,
  title,
}: {
  children: ReactNode;
  description: string;
  mode: string;
  title: string;
}) {
  return (
    <VStack align="stretch" gap={4} maxW="6xl">
      <HStack align="start" justify="space-between" gap={4} wrap="wrap">
        <Box>
          <Heading size="md">{title}</Heading>
          <Text color="fg.muted" fontSize="sm" maxW="3xl">
            {description}
          </Text>
        </Box>
        <Badge colorPalette="primary" size="lg" variant="subtle">
          {mode}
        </Badge>
      </HStack>
      <Box
        bg={{ base: "white", _dark: "gray.950" }}
        borderRadius="3xl"
        borderWidth="1px"
        p={{ base: 4, md: 6 }}
      >
        {children}
      </Box>
    </VStack>
  );
}

function DocsFormPreview({
  buttonLabel,
  buttonLeftIcon,
  defaultValues,
  description,
  formData,
  locale,
  mode,
  title,
  searchResults,
  searchFn,
  ProductGroupedIndexedSearch,
  CombinationInput,
}: {
  buttonLabel: string;
  buttonLeftIcon: string;
  defaultValues: FieldValues;
  description: string;
  formData: (t: TFunction) => FormData;
  locale: StoryLocale;
  mode: string;
  title: string;
  searchResults?: FormControllerProps["searchResults"];
  searchFn?: FormControllerProps["searchFn"];
  ProductGroupedIndexedSearch?: FormControllerProps["ProductGroupedIndexedSearch"];
  CombinationInput?: FormControllerProps["CombinationInput"];
}) {
  const t = useMemo(() => createStoryT(locale), [locale]);
  const storyI18n = useMemo(() => createStoryI18n(locale), [locale]);
  const methods = useForm<FieldValues>({
    defaultValues,
  });

  return (
    <FormStoryShell description={description} mode={mode} title={title}>
      <FormController
        methods={
          methods as unknown as NonNullable<FormControllerProps["methods"]>
        }
        buttonLeftIcon={buttonLeftIcon}
        buttonLabel={buttonLabel}
        formData={formData(t)}
        handleSubmit={async (data) => {
          action(`${title}: submit`)(data);
        }}
        searchResults={searchResults}
        searchFn={searchFn}
        ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
        CombinationInput={CombinationInput}
        t={t}
        i18n={storyI18n}
      />
    </FormStoryShell>
  );
}

function StoryProductSearch({
  copy,
  fieldData,
  fieldArrayIndex,
}: ProductGroupedIndexedSearchProps & {
  copy: Pick<
    StoryLocaleData["product"],
    "customItemName" | "linkedLabel" | "name"
  >;
}) {
  return (
    <Stack gap={2}>
      <Text fontSize="sm" fontWeight="medium">
        {fieldData.label}
      </Text>
      <HStack
        align="center"
        bg={{ base: "white", _dark: "gray.950" }}
        borderRadius="xl"
        borderWidth="1px"
        gap={3}
        px={3}
        py={2}
      >
        <MaterialSymbol color="fg.muted">search</MaterialSymbol>
        <Input
          aria-label={String(fieldData.label ?? fieldData.placeholder)}
          border="0"
          flex="1"
          px={0}
          readOnly
          value={fieldArrayIndex === 0 ? copy.name : copy.customItemName}
          _focusVisible={{ boxShadow: "none" }}
        />
        <Badge colorPalette="primary" variant="subtle">
          {copy.linkedLabel}
        </Badge>
      </HStack>
    </Stack>
  );
}

function StoryCombinationInput({
  copy,
  index,
}: CombinationInputProps & {
  copy: StoryLocaleData["combination"];
}) {
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
      <Box borderRadius="xl" borderWidth="1px" p={3}>
        <Text color="fg.muted" fontSize="xs">
          {copy.quantity}
        </Text>
        <Text fontWeight="semibold">
          {index === 0 ? copy.firstQuantity : copy.secondQuantity}
        </Text>
      </Box>
      <Box borderRadius="xl" borderWidth="1px" p={3}>
        <Text color="fg.muted" fontSize="xs">
          {copy.paper}
        </Text>
        <Text fontWeight="semibold">{copy.paperValue}</Text>
      </Box>
      <Box borderRadius="xl" borderWidth="1px" p={3}>
        <Text color="fg.muted" fontSize="xs">
          {copy.finishing}
        </Text>
        <Text fontWeight="semibold">{copy.finishingValue}</Text>
      </Box>
    </SimpleGrid>
  );
}

function getStoryCategories(locale: StoryLocale) {
  return storyLocaleData[locale].categories;
}

function getStoryCustomers(locale: StoryLocale) {
  const { customer } = storyLocaleData[locale];

  return [
    {
      id: "acme-print-studio",
      name: "Acme Print Studio",
      specialNotes: customer.specialNotes,
      contacts: [
        {
          name: "Marta Kowalska",
          email: "marta.kowalska@example.com",
          phone: "+48 500 100 200",
          active: true,
        },
      ],
      addresses: [
        {
          name: customer.billingName,
          type: AddressTypeEnum.BILLING,
          companyName: "Acme Print Studio",
          nip: "5250000000",
          street: "Prosta 1",
          zip: "00-001",
          city: "Warszawa",
          country: customer.country,
          active: true,
        },
        {
          name: customer.shippingName,
          type: AddressTypeEnum.SHIPPING,
          companyName: "Acme Print Studio",
          nip: "5250000000",
          street: "Prosta 1",
          zip: "00-001",
          city: "Warszawa",
          country: customer.country,
          active: true,
        },
      ],
    },
  ];
}

function createCategorySearch(locale: StoryLocale) {
  return async () => getStoryCategories(locale);
}

function createCustomerSearch(locale: StoryLocale) {
  return async () => getStoryCustomers(locale);
}

function createStoryProductSearch(locale: StoryLocale) {
  return function LocalizedStoryProductSearch(
    props: ProductGroupedIndexedSearchProps,
  ) {
    return (
      <StoryProductSearch {...props} copy={storyLocaleData[locale].product} />
    );
  };
}

function createStoryCombinationInput(locale: StoryLocale) {
  return function LocalizedStoryCombinationInput(props: CombinationInputProps) {
    return (
      <StoryCombinationInput
        {...props}
        copy={storyLocaleData[locale].combination}
      />
    );
  };
}

const categorySearchByLocale = {
  cs: createCategorySearch("cs"),
  de: createCategorySearch("de"),
  en: createCategorySearch("en"),
  fr: createCategorySearch("fr"),
  pl: createCategorySearch("pl"),
  sk: createCategorySearch("sk"),
  uk: createCategorySearch("uk"),
} satisfies Record<
  StoryLocale,
  () => Promise<ReturnType<typeof getStoryCategories>>
>;

const customerSearchByLocale = {
  cs: createCustomerSearch("cs"),
  de: createCustomerSearch("de"),
  en: createCustomerSearch("en"),
  fr: createCustomerSearch("fr"),
  pl: createCustomerSearch("pl"),
  sk: createCustomerSearch("sk"),
  uk: createCustomerSearch("uk"),
} satisfies Record<
  StoryLocale,
  () => Promise<ReturnType<typeof getStoryCustomers>>
>;

const productSearchByLocale = {
  cs: createStoryProductSearch("cs"),
  de: createStoryProductSearch("de"),
  en: createStoryProductSearch("en"),
  fr: createStoryProductSearch("fr"),
  pl: createStoryProductSearch("pl"),
  sk: createStoryProductSearch("sk"),
  uk: createStoryProductSearch("uk"),
} satisfies Record<
  StoryLocale,
  NonNullable<FormControllerProps["ProductGroupedIndexedSearch"]>
>;

const combinationInputByLocale = {
  cs: createStoryCombinationInput("cs"),
  de: createStoryCombinationInput("de"),
  en: createStoryCombinationInput("en"),
  fr: createStoryCombinationInput("fr"),
  pl: createStoryCombinationInput("pl"),
  sk: createStoryCombinationInput("sk"),
  uk: createStoryCombinationInput("uk"),
} satisfies Record<
  StoryLocale,
  NonNullable<FormControllerProps["CombinationInput"]>
>;

function getOrderDefaults(locale: StoryLocale): FieldValues {
  const customer = getStoryCustomers(locale)[0];
  const { order, product } = storyLocaleData[locale];

  return {
    customer,
    saveCustomer: false,
    invoice: true,
    billing: customer.addresses[0],
    contact: customer.contacts[0],
    sendStatusChangeEmail: true,
    items: [
      {
        product: {
          id: product.slug,
          name: product.name,
        },
        quantity: 1000,
      },
    ],
    exactTime: false,
    deadlineString: "2026-07-08",
    shippingOption: ShippingOptions.COMPANY_COURIER,
    shipping: customer.addresses[1],
    saveShippingAddress: false,
    status: OrderStatus.IN_PROGRESS,
    paymentType: PaymentType.BANK_TRANSFER,
    paymentStatus: PaymentStatus.PENDING,
    filesStatus: OrderFilesStatus.FILES_ARE_READY,
    printingMethods: ["DIGITAL", "CUTTING"],
    carriedOutBy: ["Anna Nowak"],
    priority: 1,
    specialNotes: order.specialNotes,
  };
}

function getProductDefaults(locale: StoryLocale): FieldValues {
  const categories = getStoryCategories(locale);
  const { product } = storyLocaleData[locale];

  return {
    priceType: PriceTypeEnum.SINGLE,
    name: product.name,
    description: product.description,
    category: categories[1],
    difficulty: 4,
    threeDModel: ThreeDModels.FLAT,
    recommended: true,
    customSize: false,
    allowCustomPrice: false,
    active: true,
    prefferedUnit: Unit.PCS,
    specialNotes: product.specialNotes,
    shipping: {
      types: [ShippingTypes.COURIER, ShippingTypes.PERSONAL_COLLECTION],
    },
    spec: {
      defaultOrder: 1000,
      minimumOrder: 100,
      maximumOrder: 10000,
      step: 100,
      images: [],
    },
    seo: {
      slug: product.slug,
      title: product.seoTitle,
      description: product.seoDescription,
    },
    prices: [
      {
        value: 8900,
        currency: CurrencyEnum.PLN,
      },
    ],
    volumes: [
      {
        value: 1000,
        markup: 0,
      },
    ],
  };
}

function getCustomerDefaults(locale: StoryLocale): FieldValues {
  const customer = getStoryCustomers(locale)[0];

  return {
    name: customer.name,
    personName: "Marta Kowalska",
    email: "marta.kowalska@example.com",
    nip: "5250000000",
    allowedBankPayments: true,
    allowedOnPickupPayments: false,
    allowedDefferedPayments: true,
    specialNotes: customer.specialNotes,
    discount: 5,
    b2b: true,
    customerGroupIds: ["b2b-priority"],
    addresses: customer.addresses,
    contacts: customer.contacts,
  };
}

function getCategoryDefaults(locale: StoryLocale): FieldValues {
  const { category } = storyLocaleData[locale];

  return {
    name: category.name,
    description: category.description,
    parentId: "printed-materials",
    seo: {
      slug: category.slug,
      title: category.seoTitle,
      description: category.seoDescription,
    },
  };
}

const storeSettingsDefaults: FieldValues = {
  buying: {
    enabled: true,
    min: 5000,
    max: 500000,
  },
  freeShipping: {
    enabled: true,
    min: 25000,
  },
  underConstruction: {
    enabled: false,
    message: "",
  },
  checkout: {
    invoiceEnabled: true,
    stockPolicy: "allow",
  },
  express: {
    enabled: true,
    percent: 25,
  },
  shippingOptionsPrices: {
    [ShippingOptions.COMPANY_COURIER]: 2499,
    [ShippingOptions.CUSTOM]: 0,
    [ShippingOptions.DHL]: 3000,
    [ShippingOptions.DPD]: 3000,
    [ShippingOptions.FEDEX]: 3500,
    [ShippingOptions.INPOST]: 2200,
    [ShippingOptions.PACZKOMATY_INPOST]: 1899,
    [ShippingOptions.PERSONAL_COLLECTION]: 0,
  },
};

function buildOrderForm(t: TFunction) {
  return selectSections(
    orderForm(
      storyMembers,
      [],
      [PaymentType.BANK_TRANSFER, PaymentType.PROFORMA, PaymentType.DEFERRED],
      t,
    ),
    [0, 1, 2, 3, 4, 5, 14, 15, 16],
  );
}

function buildProductForm(t: TFunction) {
  return withoutGeneratedMdxEditor(
    selectSections(productForm(t), [0, 2, 3, 5, 7]),
  );
}

function buildCustomerForm(t: TFunction, locale: StoryLocale) {
  return customerForm(t, [
    {
      label: storyLocaleData[locale].customer.groupLabel,
      value: "b2b-priority",
    },
  ]);
}

function buildCategoryForm(t: TFunction) {
  return categoryForm(t);
}

function buildStoreSettingsForm(t: TFunction) {
  return storeSettingsForm(t);
}

function createOrderStory(locale: StoryLocale): Story {
  const copy = storyLocaleData[locale].shell.order;

  return {
    render: () => (
      <DocsFormPreview
        locale={locale}
        title={copy.title}
        description={copy.description}
        mode={copy.mode}
        buttonLeftIcon="create"
        buttonLabel={copy.buttonLabel}
        defaultValues={getOrderDefaults(locale)}
        formData={buildOrderForm}
        searchResults={{ customers: getStoryCustomers(locale) }}
        searchFn={{ customers: customerSearchByLocale[locale] }}
        ProductGroupedIndexedSearch={productSearchByLocale[locale]}
        CombinationInput={combinationInputByLocale[locale]}
      />
    ),
  };
}

function createProductStory(locale: StoryLocale): Story {
  const copy = storyLocaleData[locale].shell.product;

  return {
    render: () => (
      <DocsFormPreview
        locale={locale}
        title={copy.title}
        description={copy.description}
        mode={copy.mode}
        buttonLeftIcon="create"
        buttonLabel={copy.buttonLabel}
        defaultValues={getProductDefaults(locale)}
        formData={buildProductForm}
        searchResults={{ categories: getStoryCategories(locale) }}
        searchFn={{ categories: categorySearchByLocale[locale] }}
      />
    ),
  };
}

function createCustomerStory(locale: StoryLocale): Story {
  const copy = storyLocaleData[locale].shell.customer;

  return {
    render: () => (
      <DocsFormPreview
        locale={locale}
        title={copy.title}
        description={copy.description}
        mode={copy.mode}
        buttonLeftIcon="create"
        buttonLabel={copy.buttonLabel}
        defaultValues={getCustomerDefaults(locale)}
        formData={(t) => buildCustomerForm(t, locale)}
      />
    ),
  };
}

function createCategoryStory(locale: StoryLocale): Story {
  const copy = storyLocaleData[locale].shell.category;

  return {
    render: () => (
      <DocsFormPreview
        locale={locale}
        title={copy.title}
        description={copy.description}
        mode={copy.mode}
        buttonLeftIcon="create"
        buttonLabel={copy.buttonLabel}
        defaultValues={getCategoryDefaults(locale)}
        formData={buildCategoryForm}
        searchResults={{ categories: getStoryCategories(locale) }}
        searchFn={{ categories: categorySearchByLocale[locale] }}
      />
    ),
  };
}

function createStoreSettingsStory(locale: StoryLocale): Story {
  const copy = storyLocaleData[locale].shell.settings;

  return {
    render: () => (
      <DocsFormPreview
        locale={locale}
        title={copy.title}
        description={copy.description}
        mode={copy.mode}
        buttonLeftIcon="edit_square"
        buttonLabel={copy.buttonLabel}
        defaultValues={storeSettingsDefaults}
        formData={buildStoreSettingsForm}
      />
    ),
  };
}

export const OrderIntakeAndFulfillment: Story = createOrderStory("en");
export const ProductForm: Story = createProductStory("en");
export const CustomerProfileForm: Story = createCustomerStory("en");
export const CategoryEditor: Story = createCategoryStory("en");
export const StoreSettings: Story = createStoreSettingsStory("en");

export const OrderIntakeAndFulfillmentCs: Story = createOrderStory("cs");
export const ProductFormCs: Story = createProductStory("cs");
export const CustomerProfileFormCs: Story = createCustomerStory("cs");
export const CategoryEditorCs: Story = createCategoryStory("cs");
export const StoreSettingsCs: Story = createStoreSettingsStory("cs");

export const OrderIntakeAndFulfillmentDe: Story = createOrderStory("de");
export const ProductFormDe: Story = createProductStory("de");
export const CustomerProfileFormDe: Story = createCustomerStory("de");
export const CategoryEditorDe: Story = createCategoryStory("de");
export const StoreSettingsDe: Story = createStoreSettingsStory("de");

export const OrderIntakeAndFulfillmentFr: Story = createOrderStory("fr");
export const ProductFormFr: Story = createProductStory("fr");
export const CustomerProfileFormFr: Story = createCustomerStory("fr");
export const CategoryEditorFr: Story = createCategoryStory("fr");
export const StoreSettingsFr: Story = createStoreSettingsStory("fr");

export const OrderIntakeAndFulfillmentPl: Story = createOrderStory("pl");
export const ProductFormPl: Story = createProductStory("pl");
export const CustomerProfileFormPl: Story = createCustomerStory("pl");
export const CategoryEditorPl: Story = createCategoryStory("pl");
export const StoreSettingsPl: Story = createStoreSettingsStory("pl");

export const OrderIntakeAndFulfillmentSk: Story = createOrderStory("sk");
export const ProductFormSk: Story = createProductStory("sk");
export const CustomerProfileFormSk: Story = createCustomerStory("sk");
export const CategoryEditorSk: Story = createCategoryStory("sk");
export const StoreSettingsSk: Story = createStoreSettingsStory("sk");

export const OrderIntakeAndFulfillmentUk: Story = createOrderStory("uk");
export const ProductFormUk: Story = createProductStory("uk");
export const CustomerProfileFormUk: Story = createCustomerStory("uk");
export const CategoryEditorUk: Story = createCategoryStory("uk");
export const StoreSettingsUk: Story = createStoreSettingsStory("uk");
