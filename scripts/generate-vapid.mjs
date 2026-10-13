#!/usr/bin/env node
// Genera el par de claves VAPID para las notificaciones push (una sola vez por instalación).
// Uso: npm run vapid   → copia las líneas en .env.local y en las variables de Vercel.
// No las rotes sin necesidad: cambiar la clave invalida todas las suscripciones de los celulares.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("# Pega esto en .env.local y en Vercel (Settings → Environment Variables):");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
console.log('VAPID_SUBJECT="mailto:correo-real-del-taller@ejemplo.com"  # Apple rechaza dominios falsos');
