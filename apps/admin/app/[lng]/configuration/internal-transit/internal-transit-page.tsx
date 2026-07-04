"use client";

import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useConfiguration } from "@/context/configuration";
import { StickyActionBar } from "@/components/configuration/taxonomy";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  loadInternalTransitSettings,
  loadTransitDayOverride,
  saveInternalTransitSettings,
  saveTransitDayOverride,
} from "@/lib/internal-transit-settings.client";
import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  Portal,
  Select,
  Separator,
  Stack,
  Text,
  createListCollection,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Field,
  MaterialSymbol,
  Switch,
  toaster,
} from "@konfi/components";
import type {
  InternalTransitSettings,
  TransferRoute,
  TransitDayOverride,
  TransitDeparture,
} from "@konfi/types";
import {
  createDefaultInternalTransitSettings,
  DEFAULT_TRANSIT_GRACE_MINUTES,
  getOrderWorkflowStatusOptions,
  normalizeInternalTransitSettings,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayDateKey(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function snapshot(settings: InternalTransitSettings): string {
  return JSON.stringify({
    routes: settings.routes,
    timezone: settings.timezone,
  });
}

interface SimpleSelectProps {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (value: string) => void;
}

function SimpleSelect({
  value,
  options,
  placeholder,
  onChange,
}: SimpleSelectProps) {
  const collection = useMemo(
    () => createListCollection({ items: options }),
    [options],
  );

  return (
    <Select.Root
      collection={collection}
      value={value ? [value] : []}
      onValueChange={({ value: next }) => onChange(next[0] ?? "")}
      size="sm"
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder={placeholder} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content>
            {collection.items.map((item) => (
              <Select.Item item={item} key={item.value}>
                <Text>{item.label}</Text>
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}

export default function InternalTransitPage() {
  const { t } = useT();
  const tenantContext = useTenantContext();
  const { channel } = useChannels();
  const { warehousesAsOptions, orderWorkflowStatusesSettings } =
    useConfiguration();
  const [settings, setSettings] = useState<InternalTransitSettings>(() =>
    createDefaultInternalTransitSettings(),
  );
  const [pristine, setPristine] = useState<string>(() => snapshot(settings));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Per-route today-override state keyed by routeId.
  const [overrides, setOverrides] = useState<
    Record<string, TransitDayOverride>
  >({});
  const [extraTimeDrafts, setExtraTimeDrafts] = useState<
    Record<string, string>
  >({});

  const warehouseOptions = useMemo(
    () =>
      (warehousesAsOptions ?? []).map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [warehousesAsOptions],
  );

  const statusOptions = useMemo(
    () => getOrderWorkflowStatusOptions(orderWorkflowStatusesSettings, t),
    [orderWorkflowStatusesSettings, t],
  );

  useEffect(() => {
    if (!channel) return;

    let active = true;
    setIsLoading(true);
    loadInternalTransitSettings(channel.id)
      .then((next) => {
        if (!active) return;
        const normalized = normalizeInternalTransitSettings(next);
        setSettings(normalized);
        setPristine(snapshot(normalized));
      })
      .catch((error: unknown) => {
        console.error("Failed to load internal transit settings:", error);
        toaster.error({
          title: t("internalTransit.loadFailed.title", {
            defaultValue: "Internal transit settings were not loaded",
          }),
          description: t("internalTransit.loadFailed.description", {
            defaultValue: "Check the channel settings and try again.",
          }),
        });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [channel, t]);

  const dirty = snapshot(settings) !== pristine;

  const updateRoute = (routeId: string, patch: Partial<TransferRoute>) => {
    setSettings((current) => ({
      ...current,
      routes: current.routes.map((route) =>
        route.id === routeId ? { ...route, ...patch } : route,
      ),
    }));
  };

  const addRoute = () => {
    setSettings((current) => ({
      ...current,
      routes: [
        ...current.routes,
        {
          id: createId("route"),
          name: "",
          toWarehouseId: "",
          departures: [],
          transitMinutes: 180,
          graceMinutes: DEFAULT_TRANSIT_GRACE_MINUTES,
          enabled: true,
        },
      ],
    }));
  };

  const removeRoute = (routeId: string) => {
    setSettings((current) => ({
      ...current,
      routes: current.routes.filter((route) => route.id !== routeId),
    }));
  };

  const addDeparture = (routeId: string) => {
    setSettings((current) => ({
      ...current,
      routes: current.routes.map((route) =>
        route.id === routeId
          ? {
              ...route,
              departures: [
                ...route.departures,
                {
                  id: createId("departure"),
                  time: "10:00",
                  daysOfWeek: [1, 2, 3, 4, 5],
                },
              ],
            }
          : route,
      ),
    }));
  };

  const updateDeparture = (
    routeId: string,
    departureId: string,
    patch: Partial<TransitDeparture>,
  ) => {
    setSettings((current) => ({
      ...current,
      routes: current.routes.map((route) =>
        route.id === routeId
          ? {
              ...route,
              departures: route.departures.map((departure) =>
                departure.id === departureId
                  ? { ...departure, ...patch }
                  : departure,
              ),
            }
          : route,
      ),
    }));
  };

  const removeDeparture = (routeId: string, departureId: string) => {
    setSettings((current) => ({
      ...current,
      routes: current.routes.map((route) =>
        route.id === routeId
          ? {
              ...route,
              departures: route.departures.filter(
                (departure) => departure.id !== departureId,
              ),
            }
          : route,
      ),
    }));
  };

  const toggleDepartureDay = (
    routeId: string,
    departure: TransitDeparture,
    day: number,
  ) => {
    const days = departure.daysOfWeek.includes(day)
      ? departure.daysOfWeek.filter((value) => value !== day)
      : [...departure.daysOfWeek, day].toSorted((a, b) => a - b);
    updateDeparture(routeId, departure.id, { daysOfWeek: days });
  };

  const handleSave = async () => {
    if (!channel) {
      toaster.error({
        title: t("internalTransit.channelRequired.title", {
          defaultValue: "Channel is required",
        }),
        description: t("internalTransit.channelRequired.description", {
          defaultValue: "Select a channel before saving transit routes.",
        }),
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = normalizeInternalTransitSettings({
        ...settings,
        updatedAt: serverTimestamp(),
      });
      await saveInternalTransitSettings(channel.id, payload, tenantContext);
      setPristine(snapshot(payload));
      toaster.success({
        title: t("internalTransit.saved.title", {
          defaultValue: "Transit routes saved",
        }),
      });
    } catch (error) {
      console.error("Failed to save internal transit settings:", error);
      toaster.error({
        title: t("internalTransit.saveFailed.title", {
          defaultValue: "Transit routes were not saved",
        }),
        description:
          error instanceof Error && error.message.includes("quota")
            ? error.message
            : t("internalTransit.saveFailed.description", {
                defaultValue: "Check the settings and try again.",
              }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Today's runs (day overrides) ----

  const today = todayDateKey(settings.timezone);

  const loadOverrideForRoute = async (routeId: string) => {
    if (!channel) return;
    try {
      const override = await loadTransitDayOverride(channel.id, routeId, today);
      setOverrides((current) => ({
        ...current,
        [routeId]: override ?? { date: today, routeId },
      }));
    } catch (error) {
      console.error("Failed to load transit day override:", error);
    }
  };

  const persistOverride = async (override: TransitDayOverride) => {
    if (!channel) return;
    setOverrides((current) => ({ ...current, [override.routeId]: override }));
    try {
      await saveTransitDayOverride(channel.id, override, tenantContext);
      toaster.success({
        title: t("internalTransit.override.saved", {
          defaultValue: "Today's run updated",
        }),
      });
    } catch (error) {
      console.error("Failed to save transit day override:", error);
      toaster.error({
        title: t("internalTransit.override.failed", {
          defaultValue: "Today's run was not updated",
        }),
      });
    }
  };

  const toggleSkipDeparture = (route: TransferRoute, departureId: string) => {
    const existing = overrides[route.id] ?? { date: today, routeId: route.id };
    const skipDepartureIds = existing.skipDepartureIds ?? [];
    const nextSkips = skipDepartureIds.includes(departureId)
      ? skipDepartureIds.filter((id) => id !== departureId)
      : [...skipDepartureIds, departureId];
    void persistOverride({
      ...existing,
      date: today,
      routeId: route.id,
      skipDepartureIds: nextSkips,
    });
  };

  const addExtraDeparture = (route: TransferRoute) => {
    const time = extraTimeDrafts[route.id]?.trim();
    if (!time || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      toaster.error({
        title: t("internalTransit.override.invalidTime", {
          defaultValue: "Enter a valid time (HH:mm)",
        }),
      });
      return;
    }
    const existing = overrides[route.id] ?? { date: today, routeId: route.id };
    void persistOverride({
      ...existing,
      date: today,
      routeId: route.id,
      extraDepartures: [...(existing.extraDepartures ?? []), { time }],
    });
    setExtraTimeDrafts((current) => ({ ...current, [route.id]: "" }));
  };

  const summary = t("internalTransit.footer", {
    count: settings.routes.length,
    defaultValue: "{{count}} transfer routes configured",
  });

  return (
    <Stack gap={6} pb={4}>
      <CustomHeading
        heading={t("internalTransit.title", {
          defaultValue: "Internal Transit Scheduling",
        })}
        mb={2}
        breadcrumb
        channelsSwitch={<ChannelsSelect />}
        goBack
        t={t}
      />

      <Field
        label={t("internalTransit.timezone.label", {
          defaultValue: "Timezone",
        })}
        helperText={t("internalTransit.timezone.helper", {
          defaultValue: "Departure times are interpreted in this timezone.",
        })}
        maxW="320px"
      >
        <Input
          value={settings.timezone}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              timezone: event.target.value,
            }))
          }
          placeholder="Europe/Warsaw"
        />
      </Field>

      <Stack gap={6}>
        {settings.routes.map((route) => (
          <Box
            key={route.id}
            p={4}
            borderWidth="1px"
            borderColor="border"
            borderRadius="lg"
          >
            <Stack gap={4}>
              <HStack justify="space-between" align="start">
                <Field
                  label={t("internalTransit.route.name", {
                    defaultValue: "Route name",
                  })}
                  flex="1"
                >
                  <Input
                    value={route.name}
                    onChange={(event) =>
                      updateRoute(route.id, { name: event.target.value })
                    }
                    placeholder={t("internalTransit.route.namePlaceholder", {
                      defaultValue: "e.g. Production → City pickup",
                    })}
                  />
                </Field>
                <HStack pt={6} gap={3}>
                  <Switch
                    checked={route.enabled}
                    onCheckedChange={({ checked }) =>
                      updateRoute(route.id, { enabled: checked })
                    }
                  >
                    {t("internalTransit.route.enabled", {
                      defaultValue: "Enabled",
                    })}
                  </Switch>
                  <IconButton
                    aria-label={t("internalTransit.route.remove", {
                      defaultValue: "Remove route",
                    })}
                    size="sm"
                    variant="ghost"
                    colorPalette="red"
                    onClick={() => removeRoute(route.id)}
                  >
                    <MaterialSymbol>delete</MaterialSymbol>
                  </IconButton>
                </HStack>
              </HStack>

              <HStack gap={4} align="start" wrap="wrap">
                <Field
                  label={t("internalTransit.route.destination", {
                    defaultValue: "Destination warehouse",
                  })}
                  minW="240px"
                >
                  <SimpleSelect
                    value={route.toWarehouseId}
                    options={warehouseOptions}
                    placeholder={t("internalTransit.route.destinationHint", {
                      defaultValue: "Select warehouse…",
                    })}
                    onChange={(value) =>
                      updateRoute(route.id, { toWarehouseId: value })
                    }
                  />
                </Field>
                <Field
                  label={t("internalTransit.route.transitMinutes", {
                    defaultValue: "Transit minutes",
                  })}
                  maxW="160px"
                >
                  <Input
                    type="number"
                    min={0}
                    value={route.transitMinutes}
                    onChange={(event) =>
                      updateRoute(route.id, {
                        transitMinutes: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label={t("internalTransit.route.graceMinutes", {
                    defaultValue: "Grace minutes",
                  })}
                  maxW="160px"
                >
                  <Input
                    type="number"
                    min={0}
                    value={route.graceMinutes}
                    onChange={(event) =>
                      updateRoute(route.id, {
                        graceMinutes: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label={t("internalTransit.route.arrivalStatus", {
                    defaultValue: "Arrival status (optional)",
                  })}
                  minW="220px"
                >
                  <SimpleSelect
                    value={route.arrivalStatusId ?? ""}
                    options={statusOptions.map((option) => ({
                      value: String(option.value),
                      label: option.label,
                    }))}
                    placeholder={t("internalTransit.route.arrivalStatusHint", {
                      defaultValue: "No auto-transition",
                    })}
                    onChange={(value) =>
                      updateRoute(route.id, {
                        arrivalStatusId: value || undefined,
                      })
                    }
                  />
                </Field>
              </HStack>

              <Separator />

              <Stack gap={3}>
                <HStack justify="space-between">
                  <Heading size="sm">
                    {t("internalTransit.departures.title", {
                      defaultValue: "Scheduled departures",
                    })}
                  </Heading>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => addDeparture(route.id)}
                  >
                    <MaterialSymbol>add</MaterialSymbol>
                    {t("internalTransit.departures.add", {
                      defaultValue: "Add departure",
                    })}
                  </Button>
                </HStack>

                {route.departures.length === 0 ? (
                  <Text fontSize="sm" color="fg.muted">
                    {t("internalTransit.departures.empty", {
                      defaultValue: "No departures yet.",
                    })}
                  </Text>
                ) : (
                  route.departures.map((departure) => (
                    <HStack
                      key={departure.id}
                      gap={3}
                      wrap="wrap"
                      align="center"
                    >
                      <Input
                        type="time"
                        maxW="120px"
                        value={departure.time}
                        onChange={(event) =>
                          updateDeparture(route.id, departure.id, {
                            time: event.target.value,
                          })
                        }
                      />
                      <HStack gap={1} wrap="wrap">
                        {WEEKDAYS.map((day) => {
                          const active = departure.daysOfWeek.includes(
                            day.value,
                          );
                          return (
                            <Button
                              key={day.value}
                              size="xs"
                              variant={active ? "solid" : "outline"}
                              colorPalette={active ? "primary" : "gray"}
                              onClick={() =>
                                toggleDepartureDay(
                                  route.id,
                                  departure,
                                  day.value,
                                )
                              }
                            >
                              {day.label}
                            </Button>
                          );
                        })}
                      </HStack>
                      <IconButton
                        aria-label={t("internalTransit.departures.remove", {
                          defaultValue: "Remove departure",
                        })}
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => removeDeparture(route.id, departure.id)}
                      >
                        <MaterialSymbol>close</MaterialSymbol>
                      </IconButton>
                    </HStack>
                  ))
                )}
              </Stack>

              <Separator />

              <Stack gap={2}>
                <HStack justify="space-between">
                  <Heading size="sm">
                    {t("internalTransit.todayRuns.title", {
                      defaultValue: "Today's runs",
                    })}
                  </Heading>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => loadOverrideForRoute(route.id)}
                  >
                    <MaterialSymbol>refresh</MaterialSymbol>
                    {t("internalTransit.todayRuns.load", {
                      defaultValue: "Load today",
                    })}
                  </Button>
                </HStack>
                <Text fontSize="xs" color="fg.muted">
                  {t("internalTransit.todayRuns.helper", {
                    date: today,
                    defaultValue: "Skip or add departures for {{date}} only.",
                  })}
                </Text>

                {route.departures.map((departure) => {
                  const skipped =
                    overrides[route.id]?.skipDepartureIds?.includes(
                      departure.id,
                    ) ?? false;
                  return (
                    <HStack key={`override-${departure.id}`} gap={3}>
                      <Text fontSize="sm" minW="60px">
                        {departure.time}
                      </Text>
                      <Switch
                        checked={skipped}
                        onCheckedChange={() =>
                          toggleSkipDeparture(route, departure.id)
                        }
                      >
                        {t("internalTransit.todayRuns.skip", {
                          defaultValue: "Skip today",
                        })}
                      </Switch>
                    </HStack>
                  );
                })}

                {(overrides[route.id]?.extraDepartures ?? []).length > 0 && (
                  <Box>
                    <Text fontSize="xs" color="fg.muted">
                      {t("internalTransit.todayRuns.extra", {
                        defaultValue: "Extra departures today:",
                      })}
                    </Text>
                    <Text fontSize="sm">
                      {(overrides[route.id]?.extraDepartures ?? [])
                        .map((extra) => extra.time)
                        .join(", ")}
                    </Text>
                  </Box>
                )}

                <HStack gap={2}>
                  <Input
                    type="time"
                    maxW="120px"
                    size="sm"
                    value={extraTimeDrafts[route.id] ?? ""}
                    onChange={(event) =>
                      setExtraTimeDrafts((current) => ({
                        ...current,
                        [route.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => addExtraDeparture(route)}
                  >
                    {t("internalTransit.todayRuns.addExtra", {
                      defaultValue: "Add extra departure",
                    })}
                  </Button>
                </HStack>
              </Stack>
            </Stack>
          </Box>
        ))}

        <Button variant="outline" onClick={addRoute} alignSelf="start">
          <MaterialSymbol>add</MaterialSymbol>
          {t("internalTransit.route.add", {
            defaultValue: "Add transfer route",
          })}
        </Button>
      </Stack>

      <StickyActionBar
        dirty={dirty}
        saving={isSaving || isLoading}
        onSave={handleSave}
        saveLabel={t("internalTransit.save", {
          defaultValue: "Save Transit Routes",
        })}
        summary={summary}
      />
    </Stack>
  );
}
