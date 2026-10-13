import { financeSettingsSchema, payrollSettingsSchema, productionSettingsSchema, type Collection, type Database, type Machine, type Position, type Settings } from "./schema";
import { DEFAULT_TIMEZONE } from "./time";

export const LEGAL_POLICY_VERSION = "2026-10-12";

/**
 * Puestos de S.M.I. Each operator position may run several machines (machine →
 * position). Coordinación and asistencia grant "gestión" access; gerencia and
 * administración are standalone admin accounts. Admins edit all of it from the app.
 */
export const DEFAULT_POSITIONS: Array<Pick<Position, "id" | "title" | "area" | "grantsAdmin" | "order">> = [
  { id: "coordinador-produccion", title: "Coordinador de producción", area: "Producción", grantsAdmin: true, order: 1 },
  { id: "asistente-administrativa", title: "Asistente administrativa", area: "Administración", grantsAdmin: true, order: 2 },
  { id: "programador-cnc", title: "Programador CNC", area: "CNC", grantsAdmin: false, order: 3 },
  { id: "soldador", title: "Soldadura, mecánica de banco, prensa y pintura", area: "Soldadura", grantsAdmin: false, order: 4 },
  { id: "fresadora", title: "Fresadora, cepillo y torno", area: "Fresado", grantsAdmin: false, order: 5 },
  { id: "tornero-1", title: "Tornero", area: "Torneado", grantsAdmin: false, order: 6 },
];

/**
 * Machines of the workshop. Only CNC¹ (Leadwell) exists today among the CNCs;
 * CNC² and the CNC lathe are planned purchases and start "inactiva" until an
 * admin activates them with a date. Everything is editable from the app.
 */
export const DEFAULT_MACHINES: Array<Pick<Machine, "id" | "name" | "process" | "description" | "state" | "order" | "positionId">> = [
  { id: "cnc-1", name: "CNC¹ Leadwell", process: "cnc", description: "Centro de mecanizado CNC Leadwell", state: "activa", order: 1, positionId: "programador-cnc" },
  { id: "cnc-2", name: "CNC²", process: "cnc", description: "Próxima compra", state: "inactiva", order: 2, positionId: "programador-cnc" },
  { id: "torno-cnc", name: "Torno CNC", process: "cnc", description: "Próxima compra", state: "inactiva", order: 3, positionId: "programador-cnc" },
  { id: "pinacho", name: "Pinacho", process: "torno", description: "Torno convencional", state: "activa", order: 4, positionId: "tornero-1" },
  { id: "wkt", name: "WKT", process: "torno", description: "Torno convencional", state: "activa", order: 5, positionId: "tornero-1" },
  { id: "bouchi", name: "Bouchi", process: "torno", description: "Torno convencional", state: "activa", order: 6, positionId: "tornero-1" },
  { id: "fresadora", name: "Fresadora", process: "fresadora", description: "Fresadora universal", state: "activa", order: 7, positionId: "fresadora" },
  { id: "cepillo", name: "Cepillo", process: "cepillo", description: "", state: "activa", order: 8, positionId: "fresadora" },
  { id: "prensa", name: "Prensa hidráulica", process: "prensa", description: "", state: "activa", order: 9, positionId: "soldador" },
  { id: "soldadura", name: "Soldadura", process: "soldadura", description: "Estación de soldadura", state: "activa", order: 10, positionId: "soldador" },
  { id: "banco", name: "Mecánica de banco", process: "banco", description: "Ajuste y ensamble", state: "activa", order: 11, positionId: "soldador" },
  { id: "pintura", name: "Pintura", process: "pintura", description: "Estación de pintura", state: "activa", order: 12, positionId: "soldador" },
];

export function defaultMachines(now: string): Collection<Machine> {
  return {
    schema: 1,
    seq: 0,
    items: DEFAULT_MACHINES.map((m) => ({
      ...m,
      activeSince: null,
      hoursPerDay: null,
      hourlyRate: 0,
      stops: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    })),
  };
}

/** Areas drive the station icon and 3D model shown in the HUD. */
export const AREAS = ["Producción", "Administración", "Torneado", "CNC", "Fresado", "Soldadura", "Mantenimiento", "Almacén", "Calidad", "Otro"] as const;

export function emptyCollection<T>(): Collection<T> {
  return { schema: 1, seq: 0, items: [] };
}

export function defaultSettings(now: string): Settings {
  return {
    workshopName: process.env.NEXT_PUBLIC_TALLER_NAME?.trim() || "Procesos productivos S.M.I.",
    timezone: process.env.TALLER_TIMEZONE?.trim() || DEFAULT_TIMEZONE,
    registrationOpen: false,
    staffLogin: false,
    boardToken: null,
    registrationCodeHash: null,
    bootstrapAdmins: [],
    maxPendingRegistrations: 25,
    legal: {
      // Public company data of S.M.I. (also on its website); editable in Ajustes.
      companyName: "SMI Servi Mecanizados Industriales SAS",
      tradeName: "SMI Servi Mecanizados Industriales SAS",
      nit: "901.469.738-9",
      address: "Cra 18 # 9 38",
      city: "Buga, Valle",
      email: "servimecanizadosindustriales@gmail.com",
      phone: "(57) 3158871953",
      privacyContact: "",
      website: "http://cliente-2-eight.vercel.app",
      policyVersion: LEGAL_POLICY_VERSION,
    },
    production: productionSettingsSchema.parse({}),
    payroll: payrollSettingsSchema.parse({}),
    finance: financeSettingsSchema.parse({}),
    updatedAt: now,
  };
}

export function defaultPositions(now: string): Collection<Position> {
  return {
    schema: 1,
    seq: 0,
    items: DEFAULT_POSITIONS.map((p) => ({
      ...p,
      contract: null,
      contractHistory: [],
      createdAt: now,
      updatedAt: now,
    })),
  };
}

/** Value used when a document does not exist yet in the data repository. */
export function defaultDoc<K extends keyof Database>(name: K, now: string): Database[K] {
  switch (name) {
    case "settings":
      return defaultSettings(now) as Database[K];
    case "positions":
      return defaultPositions(now) as Database[K];
    case "machines":
      return defaultMachines(now) as Database[K];
    default:
      return emptyCollection() as Database[K];
  }
}
