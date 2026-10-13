import { productionSettingsSchema, type Collection, type Database, type Machine, type Position, type Settings } from "./schema";
import { DEFAULT_TIMEZONE } from "./time";

export const LEGAL_POLICY_VERSION = "2026-10-12";

/** Initial workshop positions. Admins rename, add or remove them from the app. */
export const DEFAULT_POSITIONS: Array<Pick<Position, "id" | "title" | "area" | "grantsAdmin" | "order">> = [
  { id: "coordinador-produccion", title: "Coordinador de producción", area: "Producción", grantsAdmin: true, order: 1 },
  { id: "tornero-1", title: "Tornero", area: "Torneado", grantsAdmin: false, order: 2 },
  { id: "tornero-2", title: "Tornero 2", area: "Torneado", grantsAdmin: false, order: 3 },
  { id: "tornero-3", title: "Tornero 3", area: "Torneado", grantsAdmin: false, order: 4 },
  { id: "programador-cnc", title: "Programador CNC", area: "CNC", grantsAdmin: false, order: 5 },
  { id: "fresadora", title: "Fresadora", area: "Fresado", grantsAdmin: false, order: 6 },
  { id: "soldador", title: "Soldador", area: "Soldadura", grantsAdmin: false, order: 7 },
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
  { id: "wkt", name: "WKT", process: "torno", description: "Torno convencional", state: "activa", order: 5, positionId: "tornero-2" },
  { id: "bouchi", name: "Bouchi", process: "torno", description: "Torno convencional", state: "activa", order: 6, positionId: "tornero-3" },
  { id: "fresadora", name: "Fresadora", process: "fresadora", description: "Fresadora universal", state: "activa", order: 7, positionId: "fresadora" },
  { id: "prensa", name: "Prensa hidráulica", process: "prensa", description: "", state: "activa", order: 8, positionId: null },
  { id: "soldadura", name: "Soldadura", process: "soldadura", description: "Estación de soldadura", state: "activa", order: 9, positionId: "soldador" },
  { id: "banco", name: "Mecánica de banco", process: "banco", description: "Ajuste y ensamble", state: "activa", order: 10, positionId: null },
];

export const DEFAULT_HOURS_PER_DAY = 8;

export function defaultMachines(now: string): Collection<Machine> {
  return {
    schema: 1,
    seq: 0,
    items: DEFAULT_MACHINES.map((m) => ({
      ...m,
      activeSince: null,
      hoursPerDay: DEFAULT_HOURS_PER_DAY,
      hourlyRate: 0,
      stops: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    })),
  };
}

/** Areas drive the station icon and 3D model shown in the HUD. */
export const AREAS = ["Producción", "Torneado", "CNC", "Fresado", "Soldadura", "Mantenimiento", "Almacén", "Calidad", "Otro"] as const;

export function emptyCollection<T>(): Collection<T> {
  return { schema: 1, seq: 0, items: [] };
}

export function defaultSettings(now: string): Settings {
  return {
    workshopName: process.env.NEXT_PUBLIC_TALLER_NAME?.trim() || "Procesos productivos S.M.I.",
    timezone: process.env.TALLER_TIMEZONE?.trim() || DEFAULT_TIMEZONE,
    registrationOpen: true,
    registrationCodeHash: null,
    bootstrapAdmins: [],
    maxPendingRegistrations: 25,
    legal: {
      companyName: "",
      tradeName: "",
      nit: "",
      address: "",
      city: "",
      email: "",
      phone: "",
      privacyContact: "",
      website: "",
      policyVersion: LEGAL_POLICY_VERSION,
    },
    production: productionSettingsSchema.parse({}),
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
