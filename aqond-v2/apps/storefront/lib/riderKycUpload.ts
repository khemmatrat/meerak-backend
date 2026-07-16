/** Client-side Rider KYC upload + submit (via storefront API routes). */

export async function uploadRiderKycDocument(
  auth: { userId: string; token?: string },
  file: File,
  documentType: string,
): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('documentType', documentType);

  const res = await fetch('/api/rider/kyc/upload', {
    method: 'POST',
    headers: {
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      'X-User-Id': auth.userId,
    },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'อัปโหลดไม่สำเร็จ — ลองใหม่');
  }
  return String(data.url);
}

export async function fetchRiderKycStatus(auth: { userId: string; token?: string }) {
  const res = await fetch('/api/rider/kyc/status', {
    headers: {
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      'X-User-Id': auth.userId,
    },
    cache: 'no-store',
  });
  return res.json().catch(() => ({}));
}

export async function submitRiderKycDocuments(
  auth: { userId: string; token?: string },
  body: Record<string, unknown>,
) {
  const res = await fetch('/api/rider/kyc/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      'X-User-Id': auth.userId,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
