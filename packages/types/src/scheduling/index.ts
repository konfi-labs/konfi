import { Base } from "../base";
import { NestedMember } from "../configuration/member";

// Shift types
export enum ShiftType {
  MORNING = "MORNING", // First shift (e.g., 6:00-14:00)
  AFTERNOON = "AFTERNOON", // Second shift (e.g., 14:00-22:00)
  DAY = "DAY", // Full day shift (e.g., 8:00-16:00)
  CUSTOM = "CUSTOM", // Custom hours
}

export enum ShiftRequestStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

// Time slot interface
export interface TimeSlot {
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
}

// Schedule rule for dynamic scheduling
export interface ScheduleRule {
  id: string;
  memberId: string;
  warehouseId: string; // Tie rules to specific warehouse
  ruleType: "SPECIFIC_SHIFT" | "DAY_OFF" | "AVAILABILITY" | "CUSTOM";
  startDate: string; // ISO date
  endDate?: string; // ISO date, optional for one-time rules
  shiftType?: ShiftType;
  dayOfWeek?: number; // 0-6 (Sunday-Saturday)
  timeSlot?: TimeSlot;
  description?: string;
  priority: number; // Higher priority rules override lower ones
  active: boolean;
}

// Individual shift assignment
export interface Shift extends Base {
  memberId: string;
  memberName: string;
  warehouseId: string; // Tie shifts to specific warehouse
  date: string; // ISO date
  shiftType: ShiftType;
  timeSlot: TimeSlot;
  notes?: string;
  isGenerated: boolean; // True if auto-generated, false if manually created
}

// Monthly schedule
export interface Schedule extends Base {
  warehouseId: string; // Tie schedules to specific warehouse
  year: number;
  month: number; // 1-12
  shifts: Shift[];
  generatedAt?: Date;
  generatedBy?: NestedMember;
}

// Shift change request
export interface ShiftRequest extends Base {
  memberId: string;
  memberName: string;
  requestType: "SHIFT_SWAP" | "DAY_OFF" | "SHIFT_CHANGE" | "OTHER";
  originalDate?: string; // ISO date
  originalShiftId?: string;
  requestedDate?: string; // ISO date
  requestedShiftType?: ShiftType;
  swapWithMemberId?: string; // For shift swaps
  swapWithMemberName?: string;
  reason: string;
  status: ShiftRequestStatus;
  reviewedBy?: NestedMember;
  reviewedAt?: Date;
  reviewNotes?: string;
}

// Extended member with scheduling info
export interface MemberScheduleInfo {
  memberId: string;
  rules: ScheduleRule[];
  preferredShifts?: ShiftType[];
  unavailableDates?: string[]; // Array of ISO dates
}
