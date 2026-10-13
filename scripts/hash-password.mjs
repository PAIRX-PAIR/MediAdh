#!/usr/bin/env node
// Calcula el hash scrypt de una contraseña con el mismo formato que la app
// (src/lib/server/auth/password.ts) para ADMIN_BOOTSTRAP_PASSWORD_HASH.
// La contraseña se lee de la entrada estándar para que no quede en el historial:
//   echo "frase segura de doce o más" | npm run --silent hash-password
import { randomBytes, scrypt } from "node:crypto";

const N = 2 ** 17;
const R = 8;
const P = 1;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const password = input.replace(/\r?\n$/, "");
  if (password.length < 12) {
    console.error("La contraseña debe tener al menos 12 caracteres.");
    process.exit(1);
  }
  const salt = randomBytes(16);
  scrypt(password.normalize("NFKC"), salt, 64, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 }, (error, key) => {
    if (error) throw error;
    const hash = ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
    console.log("# En Vercel (Environment Variables), tal cual:");
    console.log(hash);
    // Next expands variables inside .env files, so every "$" must be escaped there.
    console.log("# En .env.local:");
    console.log(`ADMIN_BOOTSTRAP_PASSWORD_HASH="${hash.split("$").join("\\$")}"`);
  });
});
