/** "ABCDEFGH" → "ABCD-EFGH": the QR access code, readable aloud. */
export function formatDeviceCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
