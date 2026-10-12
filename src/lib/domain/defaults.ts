import type { Collection, Database, Position, Settings } from "./schema";
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

/** Areas drive the station icon and 3D model shown in the HUD. */
export const AREAS = ["Producción", "Torneado", "CNC", "Fresado", "Soldadura", "Mantenimiento", "Almacén", "Calidad", "Otro"] as const;

export function emptyCollection<T>(): Collection<T> {
  return { schema: 1, seq: 0, items: [] };
}

export function defaultSettings(now: string): Settings {
  return {
    workshopName: process.env.NEXT_PUBLIC_TALLER_NAME?.trim() || "SMI Taller",
    timezone: process.env.TALLER_TIMEZONE?.trim() || DEFAULT_TIMEZONE,
    registrationOpen: true,
    registrationCodeHash: null,
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
    default:
      return emptyCollection() as Database[K];
  }
}
