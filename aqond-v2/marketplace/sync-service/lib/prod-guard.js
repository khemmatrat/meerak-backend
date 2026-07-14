/**
 * Production fail-closed checks — import from each Node service at startup.
 */
const PLACEHOLDER = /CHANGE_ME|^devkey$|^secret$|^admin123$/i;

export function isProduction() {
  return String(process.env.AQOND_ENV || "").toLowerCase() === "production";
}

export function isWeakSecret(value, { minLength = 16 } = {}) {
  if (value == null || String(value).trim() === "") return true;
  const s = String(value);
  if (s.length < minLength) return true;
  if (PLACEHOLDER.test(s)) return true;
  return false;
}

export function assertProdSecrets(checks) {
  if (!isProduction()) return;
  const bad = checks.filter((c) => isWeakSecret(c.value, { minLength: c.minLength ?? 16 }));
  if (!bad.length) return;
  console.error(
    "[FATAL] AQOND_ENV=production — rotate weak/missing secrets:",
    bad.map((c) => c.name).join(", "),
  );
  console.error("Run: pwsh infra/scripts/rotate-secrets.ps1  then  pwsh infra/scripts/verify-prod-env.ps1");
  process.exit(1);
}

export function requireApiKey(envValue, headerNames = ["x-api-key"]) {
  return (req, res, next) => {
    if (!isProduction()) {
      if (!envValue) return next();
    }
    if (!envValue) {
      return res.status(503).json({ error: "api_key_not_configured" });
    }
    const got = headerNames.map((h) => req.headers[h.toLowerCase()]).find(Boolean);
    if (got === envValue) return next();
    return res.status(401).json({ error: "unauthorized" });
  };
}

export function strictSyncSecret(webhookSecret) {
  return (req, res, next) => {
    if (isProduction() && isWeakSecret(webhookSecret, { minLength: 16 })) {
      return res.status(503).json({ error: "sync_not_configured" });
    }
    const hdr = req.headers["x-bagisto-sync-secret"] || "";
    if (webhookSecret && hdr !== webhookSecret) {
      return res.status(403).json({ error: "invalid_secret" });
    }
    if (isProduction() && !webhookSecret) {
      return res.status(503).json({ error: "sync_not_configured" });
    }
    return next();
  };
}
