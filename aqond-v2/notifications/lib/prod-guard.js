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
