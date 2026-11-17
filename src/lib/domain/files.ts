/** Fotos y archivos que caben en una sola petición (Vercel no recibe más de 4,5 MB por vez). */
export const SINGLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Planos PDF: se suben por partes hasta este tamaño. */
export const PDF_MAX_BYTES = 50 * 1024 * 1024;
/** Tamaño de cada parte de un PDF grande: por debajo del límite de una petición. */
export const PART_BYTES = 3.5 * 1024 * 1024;
export const MAX_PARTS = 16;

/** Cuántas partes necesita un archivo de ese tamaño (la última puede ser menor). */
export const partCount = (size: number) => Math.ceil(size / PART_BYTES);
