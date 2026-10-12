import type { ContractStatus } from "./contracts";
import type {
  Announcement,
  Contract,
  DayClosure,
  LegalInfo,
  Notification,
  SupplyRequest,
  Task,
  UserStatus,
} from "./schema";

/** Shapes sent to the browser. Never include password hashes or secrets here. */

export interface MeView {
  id: string;
  username: string;
  displayName: string;
  kind: "admin" | "staff";
  isAdmin: boolean;
  phone: string | null;
  mustChangePassword: boolean;
  needsConsent: boolean;
  positionId: string | null;
  positionTitle: string | null;
  area: string | null;
  contractEndDate: string | null;
  contractStatus: ContractStatus | null;
}

export interface PositionView {
  id: string;
  title: string;
  area: string;
  grantsAdmin: boolean;
  order: number;
  status: ContractStatus;
  holder: { userId: string; name: string } | null;
  openTasks: number;
  /** Admin only. */
  contract?: (Contract & { daysLeft: number | null }) | null;
  history?: Contract[];
}

export interface UserView {
  id: string;
  username: string;
  displayName: string;
  kind: "admin" | "staff";
  status: UserStatus;
  phone: string | null;
  requestedPositionId: string | null;
  registrationNote: string | null;
  rejectionReason: string | null;
  consentAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  failedLogins: number;
  positionId: string | null;
  pushDevices: number;
}

export type NotificationView = Omit<Notification, "readBy" | "audience"> & { read: boolean };

export interface AlertView {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  body: string;
  link: string | null;
}

export interface SettingsView {
  workshopName: string;
  timezone: string;
  registrationOpen: boolean;
  hasRegistrationCode: boolean;
  maxPendingRegistrations: number;
  legal: LegalInfo;
}

export interface SyncPayload {
  version: string;
  serverTime: string;
  today: string;
  demo: boolean;
  backend: "github" | "file" | "memory";
  me: MeView;
  settings: SettingsView;
  positions: PositionView[];
  tasks: Task[];
  requests: SupplyRequest[];
  notifications: NotificationView[];
  unread: number;
  announcements: Announcement[];
  closures: DayClosure[];
  users?: UserView[];
  alerts: AlertView[];
  push: { configured: boolean; publicKey: string | null; devices: number };
}

export interface PublicInfo {
  workshopName: string;
  registrationOpen: boolean;
  requiresAccessCode: boolean;
  positions: Array<{ id: string; title: string; area: string }>;
  legal: LegalInfo;
  demo: { username: string; password: string; worker: { username: string; password: string } } | null;
  needsSetup: boolean;
}

export type UserStatusLabel = Record<UserStatus, string>;
