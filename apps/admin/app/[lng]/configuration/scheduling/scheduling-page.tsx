"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Button,
  Card,
  createListCollection,
  Field,
  Flex,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Portal,
  Separator,
  SimpleGrid,
  Skeleton,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Select } from "@chakra-ui/react/select";
import { CustomHeading, MaterialSymbol, toaster } from "@konfi/components";
import {
  Schedule,
  ScheduleRule,
  Shift,
  ShiftRequest,
  ShiftType,
} from "@konfi/types";
import {
  DEFAULT_SHIFT_TIMES,
  formatTimeSlot,
  generateSchedule,
  getShiftTypeColor,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const ShiftRequestForm = dynamic(() => import("./shift-request-form"), {
  loading: () => <Skeleton height={"400px"} />,
  ssr: false,
});

const SchedulingPage = () => {
  const { t } = useT();
  const { members, warehouses } = useConfiguration();
  const { channel } = useChannels();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [scheduleRules, setScheduleRules] = useState<ScheduleRule[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [shiftRequests, setShiftRequests] = useState<ShiftRequest[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const hasInitializedWarehouse = useRef(false);
  const lastChannelId = useRef<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  // Set default warehouse when warehouses load
  useEffect(() => {
    if (!warehouses || warehouses.length === 0) {
      lastChannelId.current = channel?.id ?? null;
      return;
    }

    const channelId = channel?.id ?? null;
    const preferredWarehouseId = channel?.warehouses?.find((warehouseId) =>
      warehouses.some((warehouse) => warehouse.id === warehouseId),
    );
    const selectedWarehouseExists = selectedWarehouseId
      ? warehouses.some((warehouse) => warehouse.id === selectedWarehouseId)
      : false;
    const channelChanged = lastChannelId.current !== channelId;

    if (!hasInitializedWarehouse.current || channelChanged) {
      const initialWarehouseId = preferredWarehouseId ?? warehouses[0]?.id;
      if (initialWarehouseId && initialWarehouseId !== selectedWarehouseId) {
        setSelectedWarehouseId(initialWarehouseId);
      }
      hasInitializedWarehouse.current = true;
      lastChannelId.current = channelId;
      return;
    }

    if (!selectedWarehouseExists) {
      const fallbackWarehouseId = preferredWarehouseId ?? warehouses[0]?.id;
      if (fallbackWarehouseId && fallbackWarehouseId !== selectedWarehouseId) {
        setSelectedWarehouseId(fallbackWarehouseId);
      }
    }

    lastChannelId.current = channelId;
  }, [warehouses, channel, selectedWarehouseId]);

  // Load schedule rules
  useEffect(() => {
    if (selectedWarehouseId) {
      loadScheduleRules();
    }
  }, [selectedWarehouseId]);

  // Load schedule and shift requests
  useEffect(() => {
    if (selectedWarehouseId) {
      loadSchedule();
      loadShiftRequests();
    }
  }, [year, month, selectedWarehouseId]);

  const loadScheduleRules = async () => {
    try {
      const rulesRef = collection(firestore, "scheduleRules");
      const rulesQuery = query(
        rulesRef,
        where("active", "==", true),
        where("warehouseId", "==", selectedWarehouseId),
      );
      const snapshot = await getDocs(rulesQuery);
      const rules = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as ScheduleRule[];
      setScheduleRules(rules);
    } catch (error) {
      console.error("Error loading schedule rules:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: t("scheduling.failedToLoadRules"),
      });
    }
  };

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const scheduleQuery = query(
        collection(firestore, "schedules"),
        where("year", "==", year),
        where("month", "==", month),
        where("warehouseId", "==", selectedWarehouseId),
      );
      const scheduleDoc = await getDocs(scheduleQuery);

      if (!scheduleDoc.empty) {
        const scheduleData = scheduleDoc.docs[0].data() as Schedule;
        setSchedule(scheduleData);
        setShifts(scheduleData.shifts || []);
      } else {
        setSchedule(null);
        setShifts([]);
      }
    } catch (error) {
      console.error("Error loading schedule:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: t("scheduling.failedToLoadSchedule"),
      });
    } finally {
      setLoading(false);
    }
  };

  const loadShiftRequests = async () => {
    try {
      const requestsRef = collection(firestore, "shiftRequests");
      const requestsQuery = query(
        requestsRef,
        where("status", "==", "PENDING"),
      );
      const snapshot = await getDocs(requestsQuery);
      const requests = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as ShiftRequest[];
      setShiftRequests(requests);
    } catch (error) {
      console.error("Error loading shift requests:", error);
    }
  };

  const handleGenerateSchedule = async () => {
    if (!members || members.length === 0) {
      toaster.error({
        title: t("scheduling.noMembers"),
        description: t("scheduling.addMembersFirst"),
      });
      return;
    }

    if (!selectedWarehouseId) {
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: "Please select a warehouse",
      });
      return;
    }

    const today = new Date();
    const currentMonthStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    );
    const targetMonthStart = new Date(year, month - 1, 1);

    if (targetMonthStart < currentMonthStart) {
      toaster.error({
        title: t("scheduling.pastDate", { defaultValue: "Past month" }),
        description: t("scheduling.cannotGeneratePast", {
          defaultValue:
            "You can only generate schedules for the current or future months",
        }),
      });
      return;
    }

    const selectedDayStart = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    );
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const isSameSelectedMonth =
      selectedDate.getFullYear() === year &&
      selectedDate.getMonth() === month - 1;

    if (
      viewMode === "day" &&
      isSameSelectedMonth &&
      selectedDayStart < todayStart
    ) {
      toaster.error({
        title: t("scheduling.pastDay", { defaultValue: "Past day" }),
        description: t("scheduling.cannotGeneratePastDay", {
          defaultValue:
            "You can only generate schedules when the selected day is today or in the future",
        }),
      });
      return;
    }

    try {
      setLoading(true);

      const generatedShifts = generateSchedule(
        year,
        month,
        selectedWarehouseId,
        members.map((m) => ({ id: m.id, name: m.name })),
        scheduleRules,
      );

      const newSchedule: Schedule = {
        id: `${selectedWarehouseId}-${year}-${month}`,
        name: `Schedule ${year}-${month}`,
        warehouseId: selectedWarehouseId,
        year,
        month,
        shifts: generatedShifts,
        generatedAt: new Date(),
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: { id: "current-user", name: "Current User" },
        updatedBy: { id: "current-user", name: "Current User" },
      };

      const scheduleRef = doc(
        firestore,
        "schedules",
        `${selectedWarehouseId}-${year}-${month}`,
      );
      await setDoc(scheduleRef, newSchedule);

      setSchedule(newSchedule);
      setShifts(generatedShifts);

      toaster.success({
        title: t("scheduling.scheduleGenerated"),
        description: t("scheduling.scheduleGeneratedDesc", {
          count: generatedShifts.length,
        }),
      });
    } catch (error) {
      console.error("Error generating schedule:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: t("scheduling.failedToLoadSchedule"),
      });
    } finally {
      setLoading(false);
    }
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const navigateDay = (direction: "prev" | "next") => {
    const newDate = new Date(selectedDate);
    if (direction === "prev") {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate);
    // Update currentDate if we moved to a different month
    if (
      newDate.getMonth() !== currentDate.getMonth() ||
      newDate.getFullYear() !== currentDate.getFullYear()
    ) {
      setCurrentDate(newDate);
    }
  };

  const navigateWeek = (direction: "prev" | "next") => {
    const newDate = new Date(selectedDate);
    if (direction === "prev") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setSelectedDate(newDate);
    // Update currentDate if we moved to a different month
    if (
      newDate.getMonth() !== currentDate.getMonth() ||
      newDate.getFullYear() !== currentDate.getFullYear()
    ) {
      setCurrentDate(newDate);
    }
  };

  // Get shifts for a specific day
  const getShiftsForDay = (day: number): Shift[] => {
    const dateStr = new Date(year, month - 1, day).toISOString().split("T")[0];
    return shifts.filter((shift) => shift.date === dateStr);
  };

  // Get shifts for a specific date (for day/week view)
  const getShiftsForDate = (date: Date): Shift[] => {
    const dateStr = date.toISOString().split("T")[0];
    return shifts.filter((shift) => shift.date === dateStr);
  };

  // Get week dates starting from Monday
  const getWeekDates = (date: Date): Date[] => {
    const dates: Date[] = [];
    const currentDay = date.getDay();
    const monday = new Date(date);

    // Adjust to Monday (0 = Sunday, 1 = Monday, etc.)
    const diff = currentDay === 0 ? -6 : 1 - currentDay;
    monday.setDate(date.getDate() + diff);

    // Get all 7 days of the week
    for (let i = 0; i < 7; i++) {
      const weekDate = new Date(monday);
      weekDate.setDate(monday.getDate() + i);
      dates.push(weekDate);
    }

    return dates;
  };

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  // Get days in current month
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const days: Array<{ day: number | null; isCurrentMonth: boolean }> = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push({ day: null, isCurrentMonth: false });
    }

    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ day, isCurrentMonth: true });
    }

    return days;
  }, [firstDayOfMonth, daysInMonth]);

  const monthName = currentDate.toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });

  const dayName = selectedDate.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const weekRange = useMemo(() => {
    if (weekDates.length === 0) return "";
    const start = weekDates[0].toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "short",
    });
    const end = weekDates[6].toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${start} - ${end}`;
  }, [weekDates]);

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

  return (
    <VStack w={"full"} h={"full"} align={"stretch"} gap={4}>
      <Flex align={"center"} wrap={"wrap"} gap={4}>
        <CustomHeading heading={t("scheduling.title")} size={"2xl"}>
          <MaterialSymbol>calendar_month</MaterialSymbol>
        </CustomHeading>
        <Spacer />
        <Button
          size={"sm"}
          variant={"ghost"}
          onClick={() =>
            (window.location.href = `/configuration/scheduling/rules`)
          }
        >
          <MaterialSymbol>rule</MaterialSymbol>
          {t("scheduling.rules.title")}
        </Button>
        <Button
          size={"sm"}
          variant={"outline"}
          onClick={() => setShowRequestForm(true)}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("scheduling.newRequest")}
        </Button>
        <Button
          size={"sm"}
          onClick={handleGenerateSchedule}
          loading={loading}
          colorPalette={"primary"}
          variant={"solid"}
        >
          <MaterialSymbol>auto_awesome</MaterialSymbol>
          {t("scheduling.generateSchedule")}
        </Button>
      </Flex>

      <Separator />

      {/* Warehouse Selector */}
      {warehouses && warehouses.length > 0 && (
        <Card.Root>
          <Card.Body>
            <Field.Root>
              <Field.Label>Warehouse</Field.Label>
              <Select.Root
                collection={warehouseCollection}
                value={[selectedWarehouseId]}
                onValueChange={(e) => setSelectedWarehouseId(e.value[0])}
              >
                <Select.Trigger>
                  <Select.ValueText placeholder="Select warehouse" />
                </Select.Trigger>
                <Portal>
                  <Select.Positioner>
                    <Select.Content>
                      {warehouseCollection.items.map((warehouse) => (
                        <Select.Item key={warehouse.value} item={warehouse}>
                          {warehouse.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </Field.Root>
          </Card.Body>
        </Card.Root>
      )}

      {/* Calendar Controls */}
      <Card.Root>
        <Card.Body>
          <Flex align={"center"} gap={4} wrap={"wrap"}>
            <HStack gap={2}>
              <IconButton
                size={"sm"}
                variant={"ghost"}
                onClick={() => {
                  if (viewMode === "month") navigateMonth("prev");
                  else if (viewMode === "week") navigateWeek("prev");
                  else navigateDay("prev");
                }}
                aria-label="Previous"
              >
                <MaterialSymbol>chevron_left</MaterialSymbol>
              </IconButton>
              <Button size={"sm"} variant={"outline"} onClick={navigateToday}>
                {t("scheduling.today")}
              </Button>
              <IconButton
                size={"sm"}
                variant={"ghost"}
                onClick={() => {
                  if (viewMode === "month") navigateMonth("next");
                  else if (viewMode === "week") navigateWeek("next");
                  else navigateDay("next");
                }}
                aria-label="Next"
              >
                <MaterialSymbol>chevron_right</MaterialSymbol>
              </IconButton>
            </HStack>

            <Heading size={"lg"}>
              {viewMode === "month" && monthName}
              {viewMode === "week" && weekRange}
              {viewMode === "day" && dayName}
            </Heading>

            <Spacer />

            {/* View Mode Toggle */}
            <HStack gap={1}>
              <Button
                size={"sm"}
                variant={viewMode === "day" ? "solid" : "ghost"}
                onClick={() => setViewMode("day")}
              >
                {t("scheduling.day")}
              </Button>
              <Button
                size={"sm"}
                variant={viewMode === "week" ? "solid" : "ghost"}
                onClick={() => setViewMode("week")}
              >
                {t("scheduling.week")}
              </Button>
              <Button
                size={"sm"}
                variant={viewMode === "month" ? "solid" : "ghost"}
                onClick={() => setViewMode("month")}
              >
                {t("scheduling.month")}
              </Button>
            </HStack>
          </Flex>
        </Card.Body>
      </Card.Root>

      {/* Pending Requests */}
      {shiftRequests.length > 0 && (
        <Card.Root colorPalette={"orange"}>
          <Card.Body>
            <HStack gap={2}>
              <MaterialSymbol>notifications</MaterialSymbol>
              <Text fontWeight={"bold"}>
                {t("scheduling.pendingRequests")}: {shiftRequests.length}
              </Text>
            </HStack>
          </Card.Body>
        </Card.Root>
      )}

      {/* Calendar View */}
      {viewMode === "month" && (
        <Card.Root>
          <Card.Body p={4}>
            <SimpleGrid columns={7} gap={2}>
              {/* Day headers */}
              {["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"].map((day) => (
                <GridItem key={day}>
                  <Text
                    fontWeight={"bold"}
                    textAlign={"center"}
                    fontSize={"sm"}
                    color={"gray.600"}
                  >
                    {day}
                  </Text>
                </GridItem>
              ))}

              {/* Calendar days */}
              {calendarDays.map((dayInfo, index) => {
                const { day, isCurrentMonth } = dayInfo;
                if (!isCurrentMonth || day === null) {
                  return <GridItem key={index} minH={"100px"} />;
                }

                const dayShifts = getShiftsForDay(day);
                const isToday =
                  day === new Date().getDate() &&
                  month === new Date().getMonth() + 1 &&
                  year === new Date().getFullYear();

                return (
                  <GridItem key={index}>
                    <Card.Root
                      size={"sm"}
                      borderColor={isToday ? "primary.solid" : undefined}
                      borderWidth={isToday ? 2 : 1}
                      minH={"100px"}
                      cursor={"pointer"}
                      onClick={() => {
                        const clickedDate = new Date(year, month - 1, day);
                        setSelectedDate(clickedDate);
                        setViewMode("day");
                      }}
                      _hover={{ borderColor: "primary.300" }}
                    >
                      <Card.Body p={2}>
                        <Text
                          fontWeight={isToday ? "bold" : "normal"}
                          fontSize={"sm"}
                          mb={2}
                        >
                          {day}
                        </Text>
                        <VStack gap={1} align={"stretch"}>
                          {dayShifts.map((shift) => (
                            <Badge
                              key={shift.id}
                              size={"sm"}
                              colorPalette={getShiftTypeColor(shift.shiftType)}
                              fontSize={"xs"}
                            >
                              {shift.memberName.split(" ")[0]} {shift.shiftType}
                            </Badge>
                          ))}
                        </VStack>
                      </Card.Body>
                    </Card.Root>
                  </GridItem>
                );
              })}
            </SimpleGrid>
          </Card.Body>
        </Card.Root>
      )}

      {/* Week View */}
      {viewMode === "week" && (
        <Card.Root>
          <Card.Body p={4}>
            <SimpleGrid columns={7} gap={2}>
              {/* Day headers */}
              {weekDates.map((date) => (
                <GridItem key={date.toISOString()}>
                  <VStack gap={1} mb={2}>
                    <Text
                      fontWeight={"bold"}
                      fontSize={"sm"}
                      color={"gray.600"}
                    >
                      {date.toLocaleDateString("pl-PL", { weekday: "short" })}
                    </Text>
                    <Text fontSize={"xs"} color={"gray.500"}>
                      {date.toLocaleDateString("pl-PL", {
                        day: "numeric",
                        month: "short",
                      })}
                    </Text>
                  </VStack>
                </GridItem>
              ))}

              {/* Week days content */}
              {weekDates.map((date) => {
                const dateShifts = getShiftsForDate(date);
                const isToday =
                  date.toDateString() === new Date().toDateString();

                return (
                  <GridItem key={date.toISOString()}>
                    <Card.Root
                      size={"sm"}
                      borderColor={isToday ? "primary.solid" : undefined}
                      borderWidth={isToday ? 2 : 1}
                      minH={"200px"}
                      cursor={"pointer"}
                      onClick={() => {
                        setSelectedDate(date);
                        setViewMode("day");
                      }}
                      _hover={{ borderColor: "primary.300" }}
                    >
                      <Card.Body p={2}>
                        <VStack gap={2} align={"stretch"}>
                          {dateShifts.length === 0 ? (
                            <Text
                              fontSize={"xs"}
                              color={"gray.400"}
                              textAlign={"center"}
                            >
                              {t("scheduling.noShifts")}
                            </Text>
                          ) : (
                            dateShifts.map((shift) => {
                              const timeSlot =
                                shift.timeSlot ||
                                DEFAULT_SHIFT_TIMES[shift.shiftType];
                              return (
                                <Card.Root
                                  key={shift.id}
                                  size={"sm"}
                                  colorPalette={getShiftTypeColor(
                                    shift.shiftType,
                                  )}
                                >
                                  <Card.Body p={2}>
                                    <VStack gap={1} align={"stretch"}>
                                      <Text fontSize={"xs"} fontWeight={"bold"}>
                                        {shift.memberName}
                                      </Text>
                                      <Badge
                                        size={"xs"}
                                        colorPalette={getShiftTypeColor(
                                          shift.shiftType,
                                        )}
                                      >
                                        {t(
                                          `scheduling.shiftTypes.${shift.shiftType}`,
                                        )}
                                      </Badge>
                                      <Text fontSize={"xs"} color={"gray.600"}>
                                        {formatTimeSlot(timeSlot)}
                                      </Text>
                                    </VStack>
                                  </Card.Body>
                                </Card.Root>
                              );
                            })
                          )}
                        </VStack>
                      </Card.Body>
                    </Card.Root>
                  </GridItem>
                );
              })}
            </SimpleGrid>
          </Card.Body>
        </Card.Root>
      )}

      {/* Day View */}
      {viewMode === "day" && (
        <Card.Root>
          <Card.Body p={6}>
            <VStack gap={4} align={"stretch"}>
              {/* Time slots grid */}
              <SimpleGrid columns={1} gap={3}>
                {(() => {
                  const dayShifts = getShiftsForDate(selectedDate);

                  if (dayShifts.length === 0) {
                    return (
                      <Card.Root>
                        <Card.Body p={8}>
                          <VStack gap={2}>
                            <Text fontSize={"4xl"}>📅</Text>
                            <Text color={"gray.500"} textAlign={"center"}>
                              {t("scheduling.noShifts")}
                            </Text>
                          </VStack>
                        </Card.Body>
                      </Card.Root>
                    );
                  }

                  // Group shifts by time slot for better visualization
                  const groupedShifts: Record<string, Shift[]> = {};
                  dayShifts.forEach((shift) => {
                    const timeSlot =
                      shift.timeSlot || DEFAULT_SHIFT_TIMES[shift.shiftType];
                    const key = `${timeSlot.startTime}-${timeSlot.endTime}`;
                    if (!groupedShifts[key]) {
                      groupedShifts[key] = [];
                    }
                    groupedShifts[key].push(shift);
                  });

                  return Object.entries(groupedShifts).map(
                    ([timeKey, shifts]) => {
                      const firstShift = shifts[0];
                      const timeSlot =
                        firstShift.timeSlot ||
                        DEFAULT_SHIFT_TIMES[firstShift.shiftType];

                      return (
                        <Card.Root
                          key={timeKey}
                          colorPalette={getShiftTypeColor(firstShift.shiftType)}
                        >
                          <Card.Body p={4}>
                            <Flex gap={4} align={"start"} wrap={"wrap"}>
                              {/* Time information */}
                              <VStack gap={1} align={"start"} minW={"120px"}>
                                <Badge
                                  size={"sm"}
                                  colorPalette={getShiftTypeColor(
                                    firstShift.shiftType,
                                  )}
                                >
                                  {t(
                                    `scheduling.shiftTypes.${firstShift.shiftType}`,
                                  )}
                                </Badge>
                                <Text fontSize={"lg"} fontWeight={"bold"}>
                                  {formatTimeSlot(timeSlot)}
                                </Text>
                                <Text fontSize={"sm"} color={"gray.600"}>
                                  {timeSlot.endTime.localeCompare(
                                    timeSlot.startTime,
                                  ) < 0
                                    ? t("scheduling.overnight")
                                    : `${Math.abs(parseInt(timeSlot.endTime.split(":")[0]) - parseInt(timeSlot.startTime.split(":")[0]))}h`}
                                </Text>
                              </VStack>

                              <Separator orientation={"vertical"} h={"80px"} />

                              {/* Members on this shift */}
                              <VStack gap={2} align={"stretch"} flex={1}>
                                <Text
                                  fontSize={"sm"}
                                  fontWeight={"semibold"}
                                  color={"gray.700"}
                                >
                                  {t("scheduling.assignedMembers")}:
                                </Text>
                                <HStack gap={2} wrap={"wrap"}>
                                  {shifts.map((shift) => (
                                    <Card.Root key={shift.id} size={"sm"}>
                                      <Card.Body p={3}>
                                        <HStack gap={2}>
                                          <MaterialSymbol>
                                            person
                                          </MaterialSymbol>
                                          <VStack gap={0} align={"start"}>
                                            <Text
                                              fontSize={"sm"}
                                              fontWeight={"bold"}
                                            >
                                              {shift.memberName}
                                            </Text>
                                            {shift.notes && (
                                              <Text
                                                fontSize={"xs"}
                                                color={"gray.600"}
                                              >
                                                {shift.notes}
                                              </Text>
                                            )}
                                          </VStack>
                                        </HStack>
                                      </Card.Body>
                                    </Card.Root>
                                  ))}
                                </HStack>
                              </VStack>
                            </Flex>
                          </Card.Body>
                        </Card.Root>
                      );
                    },
                  );
                })()}
              </SimpleGrid>

              {/* Summary */}
              <Card.Root>
                <Card.Body>
                  <HStack gap={4} wrap={"wrap"}>
                    <VStack gap={0} align={"start"}>
                      <Text fontSize={"xs"} color={"gray.600"}>
                        {t("scheduling.totalShifts")}
                      </Text>
                      <Text fontSize={"lg"} fontWeight={"bold"}>
                        {getShiftsForDate(selectedDate).length}
                      </Text>
                    </VStack>
                    <Separator orientation={"vertical"} h={"40px"} />
                    <VStack gap={0} align={"start"}>
                      <Text fontSize={"xs"} color={"gray.600"}>
                        {t("scheduling.uniqueMembers")}
                      </Text>
                      <Text fontSize={"lg"} fontWeight={"bold"}>
                        {
                          new Set(
                            getShiftsForDate(selectedDate).map(
                              (s) => s.memberId,
                            ),
                          ).size
                        }
                      </Text>
                    </VStack>
                  </HStack>
                </Card.Body>
              </Card.Root>
            </VStack>
          </Card.Body>
        </Card.Root>
      )}

      {/* Legend */}
      <Card.Root>
        <Card.Body>
          <Heading size={"sm"} mb={3}>
            {t("scheduling.legend")}
          </Heading>
          <HStack gap={4} wrap={"wrap"}>
            {Object.values(ShiftType).map((type) => (
              <HStack key={type} gap={2}>
                <Badge colorPalette={getShiftTypeColor(type)} size={"sm"}>
                  {t(`scheduling.shiftTypes.${type}`)}
                </Badge>
                <Text fontSize={"sm"} color={"gray.600"}>
                  {formatTimeSlot(DEFAULT_SHIFT_TIMES[type])}
                </Text>
              </HStack>
            ))}
          </HStack>
        </Card.Body>
      </Card.Root>

      {/* Shift Request Form Dialog */}
      {showRequestForm && (
        <ShiftRequestForm
          open={showRequestForm}
          setOpen={setShowRequestForm}
          onSuccess={() => {
            loadShiftRequests();
            setShowRequestForm(false);
          }}
        />
      )}
    </VStack>
  );
};

export default SchedulingPage;
