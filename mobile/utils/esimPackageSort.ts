import type { EsimPackageDto } from "../services/rescueNetApi";

export type EsimSortKey =
  | "days_asc"
  | "days_desc"
  | "gb_asc"
  | "gb_desc"
  | "price_asc"
  | "price_desc";

export const ESIM_SORT_OPTIONS: { key: EsimSortKey; label: string }[] = [
  { key: "days_asc", label: "วัน ↑ น้อย→มาก" },
  { key: "days_desc", label: "วัน ↓ มาก→น้อย" },
  { key: "gb_asc", label: "GB ↑ น้อย→มาก" },
  { key: "gb_desc", label: "GB ↓ มาก→น้อย" },
  { key: "price_asc", label: "ราคา ↑" },
  { key: "price_desc", label: "ราคา ↓" },
];

export function sortEsimPackages(packages: EsimPackageDto[], key: EsimSortKey): EsimPackageDto[] {
  const copy = [...packages];
  copy.sort((a, b) => {
    switch (key) {
      case "days_asc":
        return (
          a.validityDays - b.validityDays ||
          a.dataGb - b.dataGb ||
          a.totalCustomerPrice - b.totalCustomerPrice
        );
      case "days_desc":
        return (
          b.validityDays - a.validityDays ||
          b.dataGb - a.dataGb ||
          a.totalCustomerPrice - b.totalCustomerPrice
        );
      case "gb_asc":
        return (
          a.dataGb - b.dataGb ||
          a.validityDays - b.validityDays ||
          a.totalCustomerPrice - b.totalCustomerPrice
        );
      case "gb_desc":
        return (
          b.dataGb - a.dataGb ||
          b.validityDays - a.validityDays ||
          a.totalCustomerPrice - b.totalCustomerPrice
        );
      case "price_asc":
        return a.totalCustomerPrice - b.totalCustomerPrice || a.dataGb - b.dataGb;
      case "price_desc":
        return b.totalCustomerPrice - a.totalCustomerPrice || b.dataGb - a.dataGb;
      default:
        return 0;
    }
  });
  return copy;
}
