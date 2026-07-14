import { formatCatalogPrice } from '@/lib/format';

/** Add-on / sub-item on a menu line (merchant-defined). */
export type FoodMenuOption = {
  id: string;
  label: string;
  /** 0 = ฟรี */
  price_micro: number;
};

export type FoodCartOptionLine = {
  option_id: string;
  label: string;
  price_micro: number;
};

export function optionsSignature(options?: FoodCartOptionLine[]): string {
  if (!options?.length) return '';
  return [...options].map((o) => o.option_id).sort().join(',');
}

export function optionsExtraMicro(options?: FoodCartOptionLine[]): number {
  return (options || []).reduce((s, o) => s + (o.price_micro || 0), 0);
}

export function lineUnitMicro(baseMicro: number, options?: FoodCartOptionLine[]): number {
  return baseMicro + optionsExtraMicro(options);
}

export function formatOptionsSummary(options?: FoodCartOptionLine[]): string {
  if (!options?.length) return '';
  return options
    .map((o) => {
      if (o.price_micro > 0) return `${o.label} +${formatCatalogPrice(o.price_micro)}`;
      return o.label;
    })
    .join(' · ');
}

export function newOptionId(): string {
  return `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
