import { Box, Badge, Text } from "@chakra-ui/react";
import { DataTable, type DataTableProps } from "@konfi/components";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

type ProductionRow = {
  id: string;
  customer: string;
  notes: string;
  orderNumber: number;
  owner: string;
  status: "Ready" | "Review" | "Urgent";
  total: number;
};

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
  return template.replace(/\{\{(\w+)\}\}/g, (_, placeholder: string) => {
    return String(values[placeholder] ?? "");
  });
}

function storyTranslate(key: unknown, options?: unknown) {
  const resolvedKey =
    typeof key === "string"
      ? key
      : Array.isArray(key)
        ? String(key[0] ?? "")
        : String(key);
  const resolvedOptions =
    typeof options === "object" && options !== null
      ? (options as Record<string, unknown>)
      : {};
  const translation =
    typeof resolvedOptions.defaultValue === "string"
      ? resolvedOptions.defaultValue
      : humanizeKey(resolvedKey);

  return interpolateTemplate(translation, resolvedOptions);
}

const storyT = storyTranslate as unknown as DataTableProps<ProductionRow>["t"];

const storyI18n = {
  resolvedLanguage: "en",
} as unknown as DataTableProps<ProductionRow>["i18n"];

type StringCellContext = { getValue: () => string };
type NumberCellContext = { getValue: () => number };
type StatusCellContext = { getValue: () => ProductionRow["status"] };
type QuickFilterRow = Parameters<
  NonNullable<DataTableProps<ProductionRow>["getQuickFilterText"]>
>[0];

const columns = [
  {
    accessorKey: "orderNumber",
    cell: ({ getValue }: NumberCellContext) => (
      <Text fontWeight="semibold">#{getValue()}</Text>
    ),
    header: "#",
    meta: {
      minWidth: "96px",
    },
  },
  {
    accessorKey: "customer",
    cell: ({ getValue }: StringCellContext) => (
      <Text truncate>{getValue()}</Text>
    ),
    header: "Customer",
    meta: {
      minWidth: "180px",
    },
  },
  {
    accessorKey: "status",
    cell: ({ getValue }: StatusCellContext) => {
      const status = getValue();
      const colorPalette =
        status === "Urgent" ? "red" : status === "Review" ? "orange" : "green";

      return <Badge colorPalette={colorPalette}>{status}</Badge>;
    },
    header: "Status",
    meta: {
      minWidth: "120px",
    },
  },
  {
    accessorKey: "owner",
    cell: ({ getValue }: StringCellContext) => (
      <Text truncate>{getValue()}</Text>
    ),
    header: "Owner",
    meta: {
      minWidth: "140px",
    },
  },
  {
    accessorKey: "notes",
    cell: ({ getValue }: StringCellContext) => (
      <Text truncate>{getValue()}</Text>
    ),
    header: "Notes",
    meta: {
      minWidth: "280px",
      width: "minmax(0, 1.4fr)",
    },
  },
  {
    accessorKey: "total",
    cell: ({ getValue }: NumberCellContext) => `${getValue().toFixed(2)} PLN`,
    header: "Total",
    meta: {
      isNumeric: true,
      minWidth: "120px",
    },
  },
] satisfies DataTableProps<ProductionRow>["columns"];

const rows: ProductionRow[] = [
  {
    id: "1",
    customer: "Acme Construction Group",
    notes: "Window vinyl set with a long install note for the afternoon shift.",
    orderNumber: 10452,
    owner: "Marta",
    status: "Ready",
    total: 1250,
  },
  {
    id: "2",
    customer: "Blue Harbor Hotels",
    notes: "Reception desk foam board and premium matte lamination.",
    orderNumber: 10453,
    owner: "Kuba",
    status: "Review",
    total: 840.5,
  },
  {
    id: "3",
    customer: "Northwind Logistics",
    notes: "Urgent courier pickup before 15:00 with replacement pallet labels.",
    orderNumber: 10454,
    owner: "Aneta",
    status: "Urgent",
    total: 439.99,
  },
  {
    id: "4",
    customer: "Fresh Roastery",
    notes: "Short-run packaging stickers with rounded corners.",
    orderNumber: 10455,
    owner: "Tomek",
    status: "Ready",
    total: 312,
  },
  {
    id: "5",
    customer: "Studio Kreska",
    notes: "Poster proof pending approval from the client art director.",
    orderNumber: 10456,
    owner: "Magda",
    status: "Review",
    total: 128.75,
  },
  {
    id: "6",
    customer: "Metro Expo Center",
    notes: "Large-format event signage with evening installation window.",
    orderNumber: 10457,
    owner: "Paweł",
    status: "Ready",
    total: 2218.4,
  },
];

function getRowQuickFilterText(row: QuickFilterRow) {
  return [
    row.original.orderNumber,
    row.original.customer,
    row.original.status,
    row.original.owner,
    row.original.notes,
    row.original.total,
  ]
    .join(" ")
    .toLowerCase();
}

const meta = {
  title: "Shared/Tables",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const QuickFilterAndSorting: Story = {
  render: () => (
    <Box maxW="7xl" mx="auto" p={6}>
      <DataTable<ProductionRow>
        columns={columns}
        data={rows}
        defaultPageSize={5}
        getQuickFilterText={getRowQuickFilterText}
        i18n={storyI18n}
        paginationType="uncontrolled"
        t={storyT}
      />
    </Box>
  ),
};

export const LoadingRows: Story = {
  render: () => (
    <Box maxW="7xl" mx="auto" p={6}>
      <DataTable<ProductionRow>
        columns={columns}
        data={[]}
        defaultPageSize={10}
        enableQuickFilter
        getQuickFilterText={getRowQuickFilterText}
        i18n={storyI18n}
        loading
        paginationType="uncontrolled"
        t={storyT}
      />
    </Box>
  ),
};
