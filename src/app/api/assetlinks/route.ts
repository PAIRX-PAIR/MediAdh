/**
 * Digital Asset Links for the Android app (Trusted Web Activity). Served at
 * /.well-known/assetlinks.json through a rewrite. The values are public by design
 * (package name and the SHA-256 fingerprint of the signing certificate), so they
 * live in environment variables instead of a file that changes per keystore.
 */
export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_ID?.trim() || "co.smi.procesos";
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];
  return Response.json(body, {
    headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
