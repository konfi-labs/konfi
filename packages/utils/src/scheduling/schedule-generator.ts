import {
  Schedule,
  ScheduleRule,
  Shift,
  ShiftType,
  TimeSlot,
} from "@konfi/types";
import { Timestamp } from "firebase/firestore";

// Default time slots for each shift type
export const DEFAULT_SHIFT_TIMES: Record<ShiftType, TimeSlot> = {
  [ShiftType.MORNING]: { startTime: "07:00", endTime: "15:00" },
  [ShiftType.AFTERNOON]: { startTime: "14:00", endTime: "22:00" },
  [ShiftType.DAY]: { startTime: "10:00", endTime: "18:00" },
  [ShiftType.CUSTOM]: { startTime: "00:00", endTime: "00:00" },
};
/**
 * Generate a schedule for a given month based on members and rules
 */
export function generateSchedule(
  year: number,
  month: number,
  warehouseId: string,
  members: Array<{ id: string; name: string }>,
  rules: ScheduleRule[],
): Shift[] {
  const shifts: Shift[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  // Group rules by member
  const rulesByMember = new Map<string, ScheduleRule[]>();
  rules.forEach((rule) => {
    if (rule.active) {
      if (!rulesByMember.has(rule.memberId)) {
        rulesByMember.set(rule.memberId, []);
      }
      rulesByMember.get(rule.memberId)!.push(rule);
    }
  });

  // Generate shifts for each day
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.getDay();

    // For each member, check if they should work on this day
    members.forEach((member) => {
      const memberRules = rulesByMember.get(member.id) || [];
      const applicableRules = getApplicableRules(
        memberRules,
        dateStr,
        dayOfWeek,
      );

      if (applicableRules.length > 0) {
        // Sort by priority (higher priority first)
        applicableRules.sort((a, b) => b.priority - a.priority);
        const topRule = applicableRules[0];

        // Check if it's a DAY_OFF rule
        if (topRule.ruleType === "DAY_OFF") {
          // Don't create a shift for this day
          return;
        }

        // Create shift based on the rule
        const shiftType = topRule.shiftType || ShiftType.DAY;
        const timeSlot = topRule.timeSlot || DEFAULT_SHIFT_TIMES[shiftType];

        shifts.push({
          id: `${member.id}-${dateStr}`,
          name: `${member.name} - ${shiftType}`,
          memberId: member.id,
          memberName: member.name,
          warehouseId, // Add warehouse ID to each shift
          date: dateStr,
          shiftType,
          timeSlot,
          isGenerated: true,
          active: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: { id: "system", name: "System" },
          updatedBy: { id: "system", name: "System" },
        });
      }
    });
  }

  return shifts;
}

/**
 * Get applicable rules for a specific date and day of week
 */
function getApplicableRules(
  rules: ScheduleRule[],
  dateStr: string,
  dayOfWeek: number,
): ScheduleRule[] {
  return rules.filter((rule) => {
    // Check date range
    if (rule.startDate && dateStr < rule.startDate) return false;
    if (rule.endDate && dateStr > rule.endDate) return false;

    // Check day of week if specified
    if (rule.dayOfWeek !== undefined && rule.dayOfWeek !== dayOfWeek) {
      return false;
    }

    return true;
  });
}

/**
 * Get a date range for a month
 */
export function getMonthDateRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Format date for display
 */
export function formatScheduleDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format time slot for display
 */
export function formatTimeSlot(timeSlot: TimeSlot): string {
  return `${timeSlot.startTime} - ${timeSlot.endTime}`;
}

/**
 * Get shift type display name
 */
export function getShiftTypeName(shiftType: ShiftType): string {
  const names: Record<ShiftType, string> = {
    [ShiftType.MORNING]: "Poranek",
    [ShiftType.AFTERNOON]: "Popołudnie",
    [ShiftType.DAY]: "Dzień",
    [ShiftType.CUSTOM]: "Niestandardowa",
  };
  return names[shiftType];
}

/**
 * Get color for shift type
 */
export function getShiftTypeColor(shiftType: ShiftType): string {
  const colors: Record<ShiftType, string> = {
    [ShiftType.MORNING]: "blue",
    [ShiftType.AFTERNOON]: "green",
    [ShiftType.DAY]: "orange",
    [ShiftType.CUSTOM]: "gray",
  };
  return colors[shiftType];
}
