import { useT } from "@/i18n/client";
import { ManagedTranslationStatusIndicator } from "@/components/translations/ManagedTranslationStatusIndicator";
import { getChannelAvailabilitySummary } from "@/actions/product-availability";
import type { ChannelAvailabilitySummary } from "@/actions/product-availability";
import {
  Alert,
  Badge,
  Box,
  createListCollection,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  Separator,
  Skeleton,
  Spinner,
  Spacer,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import {
  AlertDialog,
  ButtonLink,
  DataTable,
  MaterialSymbol,
  MenuContent,
  MenuItem,
  MenuItemLink,
  MenuRoot,
  MenuTrigger,
  RefreshButton,
  SearchInput,
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  toaster,
  Tooltip,
} from "@konfi/components";
import {
  Category,
  NestedCategory,
  NoteEntityType,
  Product,
} from "@konfi/types";
import {
  ADMIN_CATALOG_IMPORT,
  ADMIN_CATALOG_PRODUCT_IMAGES,
  ADMIN_CATALOG_PRODUCTS_CREATE,
  ADMIN_CATALOG_PRODUCTS_EDIT,
  ADMIN_CATALOG_PRODUCTS_RATINGS,
  classifyProductAvailability,
} from "@konfi/utils";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useAuth } from "context/auth";
import { useCatalog } from "context/catalog";
import { useChannels } from "context/channels";
import { isEmpty } from "es-toolkit/compat";
import type { TFunction } from "i18next";
import dynamic from "next/dynamic";
import {
  type ChangeEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import NoteForm from "../notes/NoteForm";
import { CatalogTranslationManager } from "./CatalogTranslationManager";
import LinkProductToCustomerDialog from "./LinkProductToCustomerDialog";
import LinkProductToSupplierDialog from "./LinkProductToSupplierDialog";

const LinkProductToChannelDialog = dynamic(
  () => import("@/components/catalog/LinkProductToChannelDialog"),
  { loading: () => <Skeleton /> },
);
const LinkProductToWarehouseDialog = dynamic(
  () => import("@/components/catalog/LinkProductToWarehouseDialog"),
  { loading: () => <Skeleton /> },
);

type ProductCategoryOption = {
  category: NestedCategory;
  label: string;
  value: string;
};

function getCategoryLabel(category: Pick<Category, "id" | "name" | "path">) {
  const pathParts =
    category.path
      ?.filter((segment) => segment.id !== category.id)
      .map((segment) => segment.name)
      .filter(Boolean) ?? [];

  return [...pathParts, category.name].join(" / ");
}

function toNestedCategory(category: Category): NestedCategory {
  const nestedCategory: NestedCategory = {
    id: category.id,
    name: category.name,
  };

  if (category.parentId !== undefined) {
    nestedCategory.parentId = category.parentId;
  }

  if (category.path) {
    nestedCategory.path = category.path;
  }

  return nestedCategory;
}

function buildProductCategoryOptions({
  categories,
  productCategory,
  searchResults,
}: {
  categories: Category[] | null;
  productCategory: Product["category"];
  searchResults: Category[] | null;
}) {
  const byId = new Map<string, ProductCategoryOption>();

  if (productCategory?.id) {
    byId.set(productCategory.id, {
      category: productCategory,
      label: productCategory.name,
      value: productCategory.id,
    });
  }

  for (const category of [...(categories ?? []), ...(searchResults ?? [])]) {
    byId.set(category.id, {
      category: toNestedCategory(category),
      label: getCategoryLabel(category),
      value: category.id,
    });
  }

  return Array.from(byId.values()).toSorted((left, right) =>
    left.label.localeCompare(right.label),
  );
}

type ProductCategorySelectProps = {
  canUpdateProducts: boolean;
  categories: Category[] | null;
  product: Product;
  searchCategoriesInput: (searchKey: string) => Promise<Category[] | undefined>;
  searchResults: Category[] | null;
  t: TFunction;
  updateProductCategory: (
    product: Product,
    category: NestedCategory,
  ) => Promise<boolean>;
};

function ProductCategorySelect({
  canUpdateProducts,
  categories,
  product,
  searchCategoriesInput,
  searchResults,
  t,
  updateProductCategory,
}: ProductCategorySelectProps) {
  const [currentCategory, setCurrentCategory] = useState(product.category);
  const [searchTerm, setSearchTerm] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const options = useMemo(
    () =>
      buildProductCategoryOptions({
        categories,
        productCategory: currentCategory,
        searchResults,
      }),
    [categories, currentCategory, searchResults],
  );
  const collection = useMemo(
    () => createListCollection({ items: options }),
    [options],
  );

  useEffect(() => {
    setCurrentCategory(product.category);
  }, [product.category]);

  if (!canUpdateProducts) {
    return (
      <Text
        maxW="220px"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
      >
        {product.category.name}
      </Text>
    );
  }

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextSearchTerm = event.target.value;
    setSearchTerm(nextSearchTerm);
    void searchCategoriesInput(nextSearchTerm);
  };

  const handleCategoryChange = async (categoryId: string | undefined) => {
    if (!categoryId || categoryId === currentCategory.id) return;

    const option = options.find(
      (categoryOption) => categoryOption.value === categoryId,
    );
    if (!option) return;

    const previousCategory = currentCategory;
    setCurrentCategory(option.category);
    setIsUpdating(true);

    const updated = await updateProductCategory(product, option.category);
    setIsUpdating(false);

    if (updated) {
      toaster.success({
        title: t("products.categoryUpdated", {
          defaultValue: "Product category updated",
        }),
        description: t("products.categoryUpdatedDescription", {
          category: option.category.name,
          product: product.name,
          defaultValue: "{{product}} moved to {{category}}.",
        }),
      });
      return;
    }

    setCurrentCategory(previousCategory);
    toaster.error({
      title: t("products.categoryUpdateFailed", {
        defaultValue: "Product category was not updated",
      }),
      description: t("products.categoryUpdateFailedDescription", {
        defaultValue: "Try again or open the full product form.",
      }),
    });
  };

  return (
    <Box
      maxW="240px"
      minW="200px"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <SelectRoot
        collection={collection}
        disabled={isUpdating}
        onValueChange={(details) => {
          void handleCategoryChange(details.value[0]);
        }}
        positioning={{ strategy: "fixed", hideWhenDetached: true }}
        size="sm"
        value={currentCategory.id ? [currentCategory.id] : []}
      >
        <SelectTrigger>
          <HStack flex="1" gap="2" minW="0" pe="2rem">
            <MaterialSymbol>category</MaterialSymbol>
            <SelectValueText
              placeholder={t("products.selectCategory", {
                defaultValue: "Select category",
              })}
              truncate
            />
            {isUpdating && <Spinner size="xs" />}
          </HStack>
        </SelectTrigger>
        <SelectContent maxH="320px" minW="18rem">
          <Box p="2">
            <Input
              autoComplete="off"
              placeholder={t("products.categorySearchPlaceholder", {
                defaultValue: "Search categories",
              })}
              size="sm"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </Box>
          {collection.items.length === 0 ? (
            <Text color="fg.muted" fontSize="sm" px="3" py="2">
              {t("common.noOptions", { defaultValue: "No options" })}
            </Text>
          ) : (
            collection.items.map((option) => (
              <SelectItem key={option.value} item={option}>
                {option.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </SelectRoot>
    </Box>
  );
}

const Products = () => {
  const { t, i18n } = useT();
  const { hasTenantPermission } = useAuth();
  const canCreateProducts = hasTenantPermission("catalog.products.create");
  const canUpdateProducts = hasTenantPermission("catalog.products.update");
  const { channel } = useChannels();
  const now = useMemo(() => new Date(), []);
  const [summary, setSummary] = useState<ChannelAvailabilitySummary | null>(
    null,
  );
  const {
    loadingProducts,
    productsPageIndex,
    setProductsPageIndex,
    products,
    productsCount,
    showProducts,
    searchProducts,
    refreshProducts,
    productsSearchResults,
    cleanProductsSearchResults,
    dirtyRefreshProducts,
    removeProduct,
    categories,
    categoryInputSearchResults,
    searchCategoriesInput,
    updateProductCategory,
  } = useCatalog();
  const columHelper = createColumnHelper<Product>();
  const data = useMemo<Product[] | undefined>(
    () =>
      productsSearchResults
        ? productsSearchResults?.map((product) => product)
        : products?.map((product) => product),
    [products, productsSearchResults],
  );
  useEffect(() => {
    if (!channel?.id) return;
    let ignore = false;
    getChannelAvailabilitySummary(channel.id).then((result) => {
      if (!ignore) setSummary(result);
    });
    return () => {
      ignore = true;
    };
  }, [channel?.id]);
  const {
    open: isOpenChannelLink,
    onOpen: onOpenChannelLink,
    onClose: onCloseChannelLink,
  } = useDisclosure();
  const {
    open: isOpenCustomerLink,
    onOpen: onOpenCustomerLink,
    onClose: onCloseCustomerLink,
  } = useDisclosure();
  const {
    open: isOpenSupplierLink,
    onOpen: onOpenSupplierLink,
    onClose: onCloseSupplierLink,
  } = useDisclosure();
  const {
    open: isOpenWarehouseLink,
    onOpen: onOpenWarehouseLink,
    onClose: onCloseWarehouseLink,
  } = useDisclosure();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showNoteCreateForm, setShowNoteCreateForm] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  function handleRemove(product: Product) {
    startTransition(() => {
      setCurrentProduct(product);
      setShowRemoveDialog(true);
    });
  }

  const handleShowNoteCreateForm = useCallback((product: Product) => {
    startTransition(() => {
      setCurrentProduct(product);
      setShowNoteCreateForm(true);
    });
  }, []);

  const columns = useMemo<ColumnDef<Product, any>[]>(
    () => [
      columHelper.accessor("name", {
        cell: (info) => (
          <Tooltip content={info.getValue()}>
            <Text
              width={"200px"}
              overflow={"hidden"}
              whiteSpace={"nowrap"}
              textOverflow={"ellipsis"}
            >
              {info.getValue()}
            </Text>
          </Tooltip>
        ),
        header: t("products.name", { defaultValue: "Name" }),
      }),
      columHelper.display({
        cell: (props) => {
          const status = classifyProductAvailability(props.row.original, {
            now,
          });
          return (
            <HStack minW={"300px"}>
              {props.row.original.recommended && (
                <Badge colorPalette={"orange"}>
                  {t("products.recommended", { defaultValue: "Recommended" })}
                </Badge>
              )}
              {props.row.original.customSize && (
                <Badge colorPalette={"primary"}>
                  {t("products.customSize", { defaultValue: "Custom size" })}
                </Badge>
              )}
              {!isEmpty(props.row.original.customSizes) && (
                <Badge colorPalette={"green"}>
                  {t("products.customSizes", { defaultValue: "Custom sizes" })}
                </Badge>
              )}
              {props.row.original.allowCustomPrice && (
                <Badge colorPalette={"red"}>
                  {t("products.customPrice", { defaultValue: "Custom price" })}
                </Badge>
              )}
              {status.isExpired && (
                <Badge colorPalette={"red"}>
                  {t("products.statusExpired", { defaultValue: "Expired" })}
                </Badge>
              )}
              {!status.isExpired && status.isExpiringSoon && (
                <Badge colorPalette={"orange"}>
                  {t("products.statusExpiresSoon", {
                    defaultValue: "Expires soon",
                  })}
                </Badge>
              )}
              {status.isUnpublished && (
                <Badge colorPalette={"gray"}>
                  {t("products.statusUnpublished", {
                    defaultValue: "Unpublished",
                  })}
                </Badge>
              )}
              {status.isUnavailable && (
                <Badge colorPalette={"yellow"}>
                  {t("products.statusUnavailable", {
                    defaultValue: "Unavailable",
                  })}
                </Badge>
              )}
              {status.isScheduled && (
                <Badge colorPalette={"blue"}>
                  {t("products.statusScheduled", { defaultValue: "Scheduled" })}
                </Badge>
              )}
            </HStack>
          );
        },
        header: t("products.properties", { defaultValue: "Properties" }),
      }),
      columHelper.accessor("category.name", {
        cell: (info) => (
          <ProductCategorySelect
            canUpdateProducts={canUpdateProducts}
            categories={categories}
            product={info.row.original}
            searchCategoriesInput={searchCategoriesInput}
            searchResults={categoryInputSearchResults}
            t={t}
            updateProductCategory={updateProductCategory}
          />
        ),
        header: t("products.category", { defaultValue: "Category" }),
      }),
      columHelper.display({
        id: "translations",
        cell: (props) =>
          canUpdateProducts ? (
            <CatalogTranslationManager
              kind="product"
              source={props.row.original}
            />
          ) : (
            <ManagedTranslationStatusIndicator
              kind="product"
              source={props.row.original}
            />
          ),
        header: t("translations.managed.tableHeader", {
          defaultValue: "Translations",
        }),
      }),
      columHelper.accessor("createdAt", {
        cell: (info) =>
          info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
        header: t("products.createdAt", { defaultValue: "Created at" }),
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Flex justify={"end"} gap={"1"}>
            <MenuRoot lazyMount>
              <MenuTrigger asChild>
                <IconButton variant={"ghost"}>
                  <MaterialSymbol>menu_open</MaterialSymbol>
                </IconButton>
              </MenuTrigger>
              <MenuContent w="max-content" whiteSpace="nowrap">
                {canUpdateProducts && (
                  <MenuItemLink
                    lng={i18n.resolvedLanguage}
                    href={
                      props.row.original.channelId &&
                      props.row.original.channelId !== channel?.id
                        ? ADMIN_CATALOG_PRODUCTS_EDIT +
                          `/${props.row.original.id}?channelId=${props.row.original.channelId}`
                        : ADMIN_CATALOG_PRODUCTS_EDIT +
                          `/${props.row.original.id}`
                    }
                    value={"edit"}
                  >
                    <MaterialSymbol>edit_square</MaterialSymbol>
                    {t("products.edit", { defaultValue: "Edit" })}
                  </MenuItemLink>
                )}
                {canCreateProducts && (
                  <MenuItemLink
                    lng={i18n.resolvedLanguage}
                    href={
                      ADMIN_CATALOG_PRODUCTS_CREATE +
                      `?duplicate=${props.row.original.id}`
                    }
                    value={"duplicate"}
                  >
                    <MaterialSymbol>content_copy</MaterialSymbol>
                    {t("products.duplicate", { defaultValue: "Duplicate" })}
                  </MenuItemLink>
                )}
                <MenuItem
                  value={"note-create-form"}
                  onClick={() => handleShowNoteCreateForm(props.row.original)}
                >
                  <MaterialSymbol>note_add</MaterialSymbol>
                  {t("products.createNote", { defaultValue: "Create note" })}
                </MenuItem>
                <MenuItemLink
                  lng={i18n.resolvedLanguage}
                  href={ADMIN_CATALOG_PRODUCTS_RATINGS(props.row.original.id)}
                  value={"ratings"}
                >
                  <MaterialSymbol>star</MaterialSymbol>
                  {t("products.ratings", { defaultValue: "Ratings" })}
                </MenuItemLink>
                <MenuItem
                  value={"linkToChannel"}
                  onClick={() => {
                    setSelectedProductId(props.row.original.id);
                    onOpenChannelLink();
                  }}
                >
                  <MaterialSymbol>link</MaterialSymbol>
                  {t("products.linkToChannel", {
                    defaultValue: "Link to Channel",
                  })}
                </MenuItem>
                <MenuItem
                  value={"linkToCustomer"}
                  onClick={() => {
                    setSelectedProductId(props.row.original.id);
                    onOpenCustomerLink();
                  }}
                >
                  <MaterialSymbol>link</MaterialSymbol>
                  {t("products.linkToCustomer", {
                    defaultValue: "Link to Customer",
                  })}
                </MenuItem>
                <MenuItem
                  value={"linkToSupplier"}
                  onClick={() => {
                    setSelectedProductId(props.row.original.id);
                    onOpenSupplierLink();
                  }}
                >
                  <MaterialSymbol>link</MaterialSymbol>
                  {t("products.linkToSupplier", {
                    defaultValue: "Link to Supplier",
                  })}
                </MenuItem>
                <MenuItem
                  value={"linkToWarehouse"}
                  onClick={() => {
                    setSelectedProductId(props.row.original.id);
                    onOpenWarehouseLink();
                  }}
                >
                  <MaterialSymbol>link</MaterialSymbol>
                  {t("products.linkToWarehouse", {
                    defaultValue: "Link to Warehouse",
                  })}
                </MenuItem>
                <MenuItem
                  value={"remove-modal"}
                  onClick={() => handleRemove(props.row.original)}
                  color="fg.error"
                  _hover={{ bg: "bg.error", color: "fg.error" }}
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                  {t("products.delete", { defaultValue: "Delete Product" })}
                </MenuItem>
              </MenuContent>
            </MenuRoot>
          </Flex>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      canCreateProducts,
      canUpdateProducts,
      categories,
      categoryInputSearchResults,
      channel,
      data,
      i18n.resolvedLanguage,
      now,
      searchCategoriesInput,
      t,
      updateProductCategory,
    ],
  );

  return (
    <>
      <Heading my={"4"} size={"md"}>
        {t("products.heading", { defaultValue: "Products" })}
      </Heading>
      <Flex flexDir={["column", "row"]} gap={["2", "0"]}>
        <SearchInput
          placeholder={t("products.searchPlaceholder", {
            defaultValue: "Search products by name...",
          })}
          searchFn={searchProducts}
          cleanFn={cleanProductsSearchResults}
          searchResults={productsSearchResults}
          t={t}
        />
        <Spacer />
        <HStack gap={2}>
          <RefreshButton
            w={["100%", "auto"]}
            label={t("products.refresh", { defaultValue: "Refresh Products" })}
            refreshFunction={refreshProducts}
          />
          <ButtonLink
            variant="outline"
            href={ADMIN_CATALOG_PRODUCT_IMAGES}
            ariaLabel={t("products.manageImages", {
              defaultValue: "Manage Product Images",
            })}
          >
            <MaterialSymbol>photo_library</MaterialSymbol>
            {t("products.manageImages", {
              defaultValue: "Manage Product Images",
            })}
          </ButtonLink>
          <ButtonLink
            variant="outline"
            href="/catalog/dynamic-pricing-presets"
            ariaLabel={t("admin.dynamicPricing.managePresets", {
              defaultValue: "Manage dynamic pricing presets",
            })}
          >
            <MaterialSymbol>tune</MaterialSymbol>
            {t("admin.dynamicPricing.managePresets", {
              defaultValue: "Manage dynamic pricing presets",
            })}
          </ButtonLink>
          {process.env.NODE_ENV === "development" && canCreateProducts && (
            <ButtonLink
              lng={i18n.resolvedLanguage}
              href={ADMIN_CATALOG_IMPORT}
              variant="surface"
              colorPalette={"primary"}
              ariaLabel={t("products.import", {
                defaultValue: "Import Product",
              })}
            >
              <MaterialSymbol>cloud_download</MaterialSymbol>
              <HStack as="span" gap={1.5}>
                <span>
                  {t("products.import", { defaultValue: "Import Product" })}
                </span>
                <Badge
                  colorPalette="orange"
                  variant="solid"
                  borderRadius="full"
                  px={1.5}
                >
                  DEV
                </Badge>
              </HStack>
            </ButtonLink>
          )}
          {canCreateProducts && (
            <ButtonLink
              lng={i18n.resolvedLanguage}
              href={ADMIN_CATALOG_PRODUCTS_CREATE}
              variant="solid"
              colorPalette={"primary"}
              ariaLabel={t("products.add", { defaultValue: "Add Product" })}
            >
              <MaterialSymbol>add</MaterialSymbol>
              {t("products.add", { defaultValue: "Add Product" })}
            </ButtonLink>
          )}
        </HStack>
      </Flex>
      <Separator my={"6"} />
      {summary &&
        (summary.expiringSoonCount > 0 ||
          summary.hiddenByExpirationCount > 0) && (
          <Alert.Root status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("products.expiryWarningTitle", {
                  defaultValue: "Some products need attention",
                })}
              </Alert.Title>
              <Alert.Description>
                {summary.expiringSoonCount > 0 && (
                  <Text>
                    {t("products.expiryWarningExpiringSoon", {
                      count: summary.expiringSoonCount,
                      defaultValue:
                        "{{count}} product(s) expiring within 90 days",
                    })}
                  </Text>
                )}
                {summary.hiddenByExpirationCount > 0 && (
                  <Text>
                    {t("products.expiryWarningHidden", {
                      count: summary.hiddenByExpirationCount,
                      defaultValue:
                        "{{count}} product(s) already hidden by expiration",
                    })}
                  </Text>
                )}
                {summary.nearestExpiration && (
                  <Text>
                    {t("products.expiryWarningNearest", {
                      date: summary.nearestExpiration.slice(0, 10),
                      defaultValue: "Nearest expiration: {{date}}",
                    })}
                  </Text>
                )}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      {data && !(data.length <= 0) && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={productsSearchResults ? "uncontrolled" : "controlled"}
          show={showProducts}
          itemsCount={
            productsSearchResults ? productsSearchResults.length : productsCount
          }
          loading={loadingProducts}
          refreshFlag={dirtyRefreshProducts}
          defaultPageIndex={productsPageIndex}
          setPageIndex={setProductsPageIndex}
          enablePageSizeSelection
          t={t}
          i18n={i18n}
        />
      )}
      <LinkProductToChannelDialog
        productId={selectedProductId}
        isOpen={isOpenChannelLink}
        onClose={onCloseChannelLink}
      />
      <LinkProductToCustomerDialog
        productId={selectedProductId}
        isOpen={isOpenCustomerLink}
        onClose={onCloseCustomerLink}
      />
      <LinkProductToSupplierDialog
        productId={selectedProductId}
        isOpen={isOpenSupplierLink}
        onClose={onCloseSupplierLink}
      />
      <LinkProductToWarehouseDialog
        productId={selectedProductId}
        isOpen={isOpenWarehouseLink}
        onClose={onCloseWarehouseLink}
      />
      <AlertDialog
        header={t("products.deleteConfirmHeader", {
          defaultValue: "Are you sure you want to delete the product?",
        })}
        handle={() => removeProduct(currentProduct!)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>
          {t("products.deleteConfirmText", {
            defaultValue:
              "After deleting the product, you will not be able to restore it.",
          })}
        </Text>
      </AlertDialog>
      <NoteForm
        type={"CREATE"}
        asDrawer
        open={showNoteCreateForm}
        setOpen={setShowNoteCreateForm}
        entityId={
          currentProduct?.id + "?channelId=" + currentProduct?.channelId
        }
        entityType={NoteEntityType.PRODUCT}
      />
    </>
  );
};

export default Products;
