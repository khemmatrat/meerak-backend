import { api } from "./api";

export interface EsimPackageDto {
  sku: string;
  name: string;
  region: string;
  validityDays: number;
  dataGb: number;
  basePrice: number;
  markupPercent: number;
  markupAmount: number;
  convenienceFee: number;
  totalCustomerPrice: number;
  /** คำอธิบายจาก GigaStore / mock — อาจว่าง */
  notes?: string;
}

/** Catalog จาก backend — mock หรือ gigastore live ตาม env บนเซิร์ฟเวอร์ */
export interface EsimCatalogResult {
  packages: EsimPackageDto[];
  /** `gigastore` เมื่อ GIGASTORE_USE_LIVE=1 + credentials; ไม่เช่นนั้นเป็น mock */
  source?: string;
  /** จาก API เช่น total = base × 1.05 + convenience */
  pricingNote?: string;
}

export async function fetchEsimPackages(): Promise<EsimCatalogResult> {
  const { data } = await api.get<{
    ok?: boolean;
    packages?: EsimPackageDto[];
    source?: string;
    pricingNote?: string;
  }>("/v1/telecom/esim-packages", { timeout: 30000 });
  return {
    packages: data.packages || [],
    source: data.source,
    pricingNote: data.pricingNote,
  };
}

export async function purchaseEsim(sku: string): Promise<{
  ok: boolean;
  purchaseId: string;
  assetId: string;
  totalCharged: number;
  activationQrDataUrl: string;
  activationPayload: string;
  gigastoreOrderRef: string;
  createdAt: string;
}> {
  const { data } = await api.post("/v1/telecom/purchase-esim", { sku });
  return data as any;
}

export interface VaultItemDto {
  id: string;
  sku: string;
  name: string;
  orderRef: string | null;
  activationPayload: string;
  activationQrDataUrl: string | null;
  basePrice: number;
  totalCharged: number;
  createdAt: string;
}

export async function fetchMyVault(): Promise<VaultItemDto[]> {
  const { data } = await api.get<{ ok?: boolean; items?: VaultItemDto[] }>("/v1/telecom/my-vault");
  return data.items || [];
}

const CACHE_KEY = "aqond_rescue_net_vault_v1";

export function cacheVaultItemsLocally(userId: string, items: VaultItemDto[]): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ userId, savedAt: Date.now(), items })
    );
  } catch {
    /* quota */
  }
}

export function loadCachedVault(userId: string | undefined): VaultItemDto[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { userId?: string; items?: VaultItemDto[] };
    if (parsed.userId !== userId) return [];
    return parsed.items || [];
  } catch {
    return [];
  }
}
