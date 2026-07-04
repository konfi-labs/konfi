"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Button,
  Card,
  createListCollection,
  Field,
  Flex,
  HStack,
  Input,
  Separator,
  Spacer,
  Stack,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { Select } from "@chakra-ui/react/select";
import {
  AlertDialog,
  CustomDialog,
  CustomHeading,
  DataTable,
  DatePickerInput,
  MaterialSymbol,
  Switch,
  toaster,
} from "@konfi/components";
import { ScheduleRule, ShiftType } from "@konfi/types";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useConfiguration } from "context/configuration";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";

const ScheduleRulesPage = () => {
  const { t, i18n } = useT();
  const { members, warehouses } = useConfiguration();
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentRule, setCurrentRule] = useState<ScheduleRule | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      const rulesRef = collection(firestore, "scheduleRules");
      const snapshot = await getDocs(rulesRef);
      const loadedRules = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as ScheduleRule[];
      setRules(loadedRules);
    } catch (error) {
      console.error("Error loading schedule rules:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: t("scheduling.failedToLoadRules"),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = () => {
    setFormMode("create");
    setCurrentRule(null);
    setShowRuleForm(true);
  };

  const handleEditRule = (rule: ScheduleRule) => {
    setFormMode("edit");
    setCurrentRule(rule);
    setShowRuleForm(true);
  };

  const handleDeleteRule = (rule: ScheduleRule) => {
    setCurrentRule(rule);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!currentRule) return;

    try {
      const ruleRef = doc(firestore, "scheduleRules", currentRule.id);
      await deleteDoc(ruleRef);

      toaster.success({
        title: t("scheduling.rules.deleted"),
        description: t("scheduling.rules.deletedDesc"),
      });

      loadRules();
      setShowDeleteDialog(false);
      setCurrentRule(null);
    } catch (error) {
      console.error("Error deleting rule:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: t("scheduling.rules.failedToDelete"),
      });
    }
  };

  const getMemberName = (memberId: string) => {
    const member = members?.find((m) => m.id === memberId);
    return member?.name || memberId;
  };

  const getWarehouseName = (warehouseId: string) => {
    const warehouse = warehouses?.find((w) => w.id === warehouseId);
    return warehouse?.name || warehouseId;
  };

  const columHelper = createColumnHelper<ScheduleRule>();

  const columns: ColumnDef<ScheduleRule, any>[] = useMemo(
    () => [
      columHelper.accessor("warehouseId", {
        header: "Warehouse",
        cell: (info) => getWarehouseName(info.getValue()),
      }),
      columHelper.accessor("memberId", {
        header: t("scheduling.rules.member"),
        cell: (info) => getMemberName(info.getValue()),
      }),
      columHelper.accessor("ruleType", {
        header: t("scheduling.rules.ruleType"),
        cell: (info) => t(`scheduling.rules.ruleTypes.${info.getValue()}`),
      }),
      columHelper.accessor("startDate", {
        header: t("scheduling.rules.startDate"),
        cell: (info) => info.getValue(),
      }),
      columHelper.accessor("endDate", {
        header: t("scheduling.rules.endDate"),
        cell: (info) => info.getValue() || "-",
      }),
      columHelper.accessor("shiftType", {
        header: t("scheduling.rules.shiftType"),
        cell: (info) =>
          info.getValue() ? t(`scheduling.shiftTypes.${info.getValue()}`) : "-",
      }),
      columHelper.accessor("priority", {
        header: t("scheduling.rules.priority"),
        cell: (info) => info.getValue(),
      }),
      columHelper.accessor("active", {
        header: t("scheduling.rules.active"),
        cell: (info) => (info.getValue() ? "✓" : "✗"),
      }),
      columHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <HStack gap={2} justify="flex-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleEditRule(info.row.original)}
            >
              <MaterialSymbol>edit</MaterialSymbol>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              colorPalette="red"
              onClick={() => handleDeleteRule(info.row.original)}
            >
              <MaterialSymbol>delete</MaterialSymbol>
            </Button>
          </HStack>
        ),
      }),
    ],
    [t, members, warehouses],
  );

  return (
    <VStack w={"full"} h={"full"} align={"stretch"} gap={4}>
      <Flex align={"center"} wrap={"wrap"} gap={4}>
        <CustomHeading heading={t("scheduling.rules.title")} size={"2xl"}>
          <MaterialSymbol>rule</MaterialSymbol>
        </CustomHeading>
        <Spacer />
        <Button
          size={"sm"}
          onClick={handleCreateRule}
          colorPalette={"primary"}
          variant={"solid"}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("scheduling.rules.add")}
        </Button>
      </Flex>

      <Separator />

      {rules.length === 0 ? (
        <Card.Root>
          <Card.Body>
            <VStack gap={4}>
              <MaterialSymbol fontSize={"64px"} color={"gray.400"}>
                rule
              </MaterialSymbol>
              <Text fontSize={"lg"} fontWeight={"bold"}>
                {t("scheduling.rules.noRules")}
              </Text>
              <Text color={"gray.600"}>
                {t("scheduling.rules.addFirstRule")}
              </Text>
              <Button onClick={handleCreateRule} colorPalette={"primary"}>
                <MaterialSymbol>add</MaterialSymbol>
                {t("scheduling.rules.add")}
              </Button>
            </VStack>
          </Card.Body>
        </Card.Root>
      ) : (
        <Card.Root>
          <Card.Body>
            <DataTable
              columns={columns}
              data={rules}
              paginationType={"uncontrolled"}
              t={t}
              i18n={i18n}
            />
          </Card.Body>
        </Card.Root>
      )}

      {showRuleForm && (
        <RuleForm
          open={showRuleForm}
          setOpen={setShowRuleForm}
          rule={currentRule}
          mode={formMode}
          onSuccess={loadRules}
        />
      )}

      <AlertDialog
        header={t("scheduling.rules.delete")}
        handle={confirmDelete}
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        t={t}
      />
    </VStack>
  );
};

interface RuleFormProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  rule: ScheduleRule | null;
  mode: "create" | "edit";
  onSuccess: () => void;
}

function RuleForm({ open, setOpen, rule, mode, onSuccess }: RuleFormProps) {
  const { t, i18n } = useT();
  const { members, warehouses } = useConfiguration();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    memberId: rule?.memberId || "",
    warehouseId: rule?.warehouseId || "",
    ruleType: rule?.ruleType || ("SPECIFIC_SHIFT" as const),
    startDate: rule?.startDate || "",
    endDate: rule?.endDate || "",
    shiftType: rule?.shiftType || ShiftType.DAY,
    dayOfWeek: rule?.dayOfWeek?.toString() || "",
    priority: rule?.priority || 1,
    description: rule?.description || "",
    timeSlot: rule?.timeSlot || { startTime: "08:00", endTime: "16:00" },
    active: rule?.active !== undefined ? rule.active : true,
  });

  // Set default warehouse if not set
  useEffect(() => {
    if (warehouses && warehouses.length > 0 && !formData.warehouseId) {
      setFormData((prev) => ({ ...prev, warehouseId: warehouses[0].id }));
    }
  }, [warehouses, formData.warehouseId]);

  const memberCollection = useMemo(
    () =>
      createListCollection({
        items:
          members?.map((member) => ({
            label: member.name,
            value: member.id,
          })) || [],
      }),
    [members],
  );

  const warehouseCollection = useMemo(
    () =>
      createListCollection({
        items:
          warehouses?.map((warehouse) => ({
            label: warehouse.name,
            value: warehouse.id,
          })) || [],
      }),
    [warehouses],
  );

  const ruleTypeCollection = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: t("scheduling.rules.ruleTypes.SPECIFIC_SHIFT"),
            value: "SPECIFIC_SHIFT",
          },
          { label: t("scheduling.rules.ruleTypes.DAY_OFF"), value: "DAY_OFF" },
          {
            label: t("scheduling.rules.ruleTypes.AVAILABILITY"),
            value: "AVAILABILITY",
          },
          { label: t("scheduling.rules.ruleTypes.CUSTOM"), value: "CUSTOM" },
        ],
      }),
    [t],
  );

  const shiftTypeCollection = useMemo(
    () =>
      createListCollection({
        items: Object.values(ShiftType).map((type) => ({
          label: t(`scheduling.shiftTypes.${type}`),
          value: type,
        })),
      }),
    [t],
  );

  const dayOfWeekCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { label: "All days", value: "" },
          ...Array.from({ length: 7 }, (_, i) => ({
            label: t(`scheduling.rules.daysOfWeek.${i}`),
            value: i.toString(),
          })),
        ],
      }),
    [t],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const ruleData: Omit<ScheduleRule, "id"> = {
        memberId: formData.memberId,
        warehouseId: formData.warehouseId,
        ruleType: formData.ruleType,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        shiftType:
          formData.ruleType === "SPECIFIC_SHIFT"
            ? formData.shiftType
            : undefined,
        dayOfWeek: formData.dayOfWeek
          ? parseInt(formData.dayOfWeek)
          : undefined,
        priority: formData.priority,
        description: formData.description || undefined,
        timeSlot:
          formData.ruleType === "CUSTOM" ? formData.timeSlot : undefined,
        active: formData.active,
      };

      if (mode === "edit" && rule) {
        const ruleRef = doc(firestore, "scheduleRules", rule.id);
        await updateDoc(ruleRef, ruleData as any);

        toaster.success({
          title: t("scheduling.rules.updated"),
          description: t("scheduling.rules.updatedDesc"),
        });
      } else {
        const rulesRef = collection(firestore, "scheduleRules");
        await addDoc(rulesRef, ruleData);

        toaster.success({
          title: t("scheduling.rules.created"),
          description: t("scheduling.rules.createdDesc"),
        });
      }

      onSuccess();
      setOpen(false);
    } catch (error) {
      console.error("Error saving rule:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description:
          mode === "edit"
            ? t("scheduling.rules.failedToUpdate")
            : t("scheduling.rules.failedToCreate"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <CustomDialog
      open={open}
      setOpen={setOpen}
      header={
        mode === "edit" ? t("scheduling.rules.edit") : t("scheduling.rules.add")
      }
      size={"lg"}
    >
      <form onSubmit={handleSubmit}>
        <VStack gap={4} align={"stretch"}>
          <Field.Root required>
            <Field.Label>{t("scheduling.rules.member")}</Field.Label>
            <Select.Root
              collection={memberCollection}
              value={formData.memberId ? [formData.memberId] : []}
              onValueChange={(e) =>
                setFormData({ ...formData, memberId: e.value[0] })
              }
            >
              <Select.Trigger>
                <Select.ValueText
                  placeholder={t("scheduling.requests.selectMember")}
                />
              </Select.Trigger>
              <Select.Positioner>
                <Select.Content>
                  {memberCollection.items.map((member) => (
                    <Select.Item key={member.value} item={member}>
                      {member.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Select.Root>
          </Field.Root>

          <Field.Root required>
            <Field.Label>Warehouse</Field.Label>
            <Select.Root
              collection={warehouseCollection}
              value={formData.warehouseId ? [formData.warehouseId] : []}
              onValueChange={(e) =>
                setFormData({ ...formData, warehouseId: e.value[0] })
              }
            >
              <Select.Trigger>
                <Select.ValueText placeholder="Select Warehouse" />
              </Select.Trigger>
              <Select.Positioner>
                <Select.Content>
                  {warehouseCollection.items.map((warehouse) => (
                    <Select.Item key={warehouse.value} item={warehouse}>
                      {warehouse.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Select.Root>
          </Field.Root>

          <Field.Root required>
            <Field.Label>{t("scheduling.rules.ruleType")}</Field.Label>
            <Select.Root
              collection={ruleTypeCollection}
              value={[formData.ruleType]}
              onValueChange={(e) =>
                setFormData({
                  ...formData,
                  ruleType: e.value[0] as ScheduleRule["ruleType"],
                })
              }
            >
              <Select.Trigger>
                <Select.ValueText />
              </Select.Trigger>
              <Select.Positioner>
                <Select.Content>
                  {ruleTypeCollection.items.map((ruleType) => (
                    <Select.Item key={ruleType.value} item={ruleType}>
                      {ruleType.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Select.Root>
          </Field.Root>

          <Stack direction={{ base: "column", md: "row" }} gap={4}>
            <Field.Root required flex={1}>
              <Field.Label>{t("scheduling.rules.startDate")}</Field.Label>
              <DatePickerInput
                flex={1}
                value={formData.startDate}
                onValueChange={(startDate) =>
                  setFormData({ ...formData, startDate })
                }
                locale={i18n.resolvedLanguage}
                triggerLabel={t("scheduling.rules.startDate")}
                inputProps={{
                  required: true,
                  "aria-label": t("scheduling.rules.startDate"),
                }}
              />
            </Field.Root>

            <Field.Root flex={1}>
              <Field.Label>{t("scheduling.rules.endDate")}</Field.Label>
              <DatePickerInput
                flex={1}
                value={formData.endDate}
                onValueChange={(endDate) =>
                  setFormData({ ...formData, endDate })
                }
                locale={i18n.resolvedLanguage}
                triggerLabel={t("scheduling.rules.endDate")}
                inputProps={{
                  "aria-label": t("scheduling.rules.endDate"),
                }}
              />
            </Field.Root>
          </Stack>

          {formData.ruleType === "SPECIFIC_SHIFT" && (
            <Field.Root>
              <Field.Label>{t("scheduling.rules.shiftType")}</Field.Label>
              <Select.Root
                collection={shiftTypeCollection}
                value={[formData.shiftType]}
                onValueChange={(e) =>
                  setFormData({
                    ...formData,
                    shiftType: e.value[0] as ShiftType,
                  })
                }
              >
                <Select.Trigger>
                  <Select.ValueText />
                </Select.Trigger>
                <Select.Positioner>
                  <Select.Content>
                    {shiftTypeCollection.items.map((shiftType) => (
                      <Select.Item key={shiftType.value} item={shiftType}>
                        {shiftType.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Select.Root>
            </Field.Root>
          )}

          {formData.ruleType === "CUSTOM" && (
            <Stack direction={{ base: "column", md: "row" }} gap={4}>
              <Field.Root flex={1}>
                <Field.Label>{t("scheduling.rules.startTime")}</Field.Label>
                <Input
                  type="time"
                  value={formData.timeSlot.startTime}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      timeSlot: {
                        ...formData.timeSlot,
                        startTime: e.target.value,
                      },
                    })
                  }
                />
              </Field.Root>

              <Field.Root flex={1}>
                <Field.Label>{t("scheduling.rules.endTime")}</Field.Label>
                <Input
                  type="time"
                  value={formData.timeSlot.endTime}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      timeSlot: {
                        ...formData.timeSlot,
                        endTime: e.target.value,
                      },
                    })
                  }
                />
              </Field.Root>
            </Stack>
          )}

          <Field.Root>
            <Field.Label>{t("scheduling.rules.dayOfWeek")}</Field.Label>
            <Select.Root
              collection={dayOfWeekCollection}
              value={[formData.dayOfWeek]}
              onValueChange={(e) =>
                setFormData({ ...formData, dayOfWeek: e.value[0] })
              }
            >
              <Select.Trigger>
                <Select.ValueText />
              </Select.Trigger>
              <Select.Positioner>
                <Select.Content>
                  {dayOfWeekCollection.items.map((day) => (
                    <Select.Item key={day.value} item={day}>
                      {day.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Select.Root>
          </Field.Root>

          <Field.Root required>
            <Field.Label>{t("scheduling.rules.priority")}</Field.Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: parseInt(e.target.value) })
              }
              required
            />
          </Field.Root>

          <Field.Root>
            <Field.Label>{t("scheduling.rules.description")}</Field.Label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
            />
          </Field.Root>

          <Field.Root>
            <HStack justify="space-between">
              <Field.Label>{t("scheduling.rules.active")}</Field.Label>
              <Switch
                checked={formData.active}
                onCheckedChange={(e: { checked: boolean }) =>
                  setFormData({ ...formData, active: e.checked })
                }
              />
            </HStack>
          </Field.Root>

          <Button type={"submit"} colorPalette={"primary"} loading={loading}>
            {mode === "edit" ? t("actions.saveChanges") : t("actions.generate")}
          </Button>
        </VStack>
      </form>
    </CustomDialog>
  );
}

export default ScheduleRulesPage;
