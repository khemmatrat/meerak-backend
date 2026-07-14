/**
 * Canonical values for PATCH `expert_category` — must stay aligned with backend.
 * Profile dropdown subset (Talents filters may list more ids separately).
 */

export interface ProfileExpertCategoryOption {
  value: string;
  label: string;
}

export const PROFILE_EXPERT_CATEGORY_OPTIONS: ProfileExpertCategoryOption[] = [
  { value: "chef", label: "Gourmet & Chef" },
  { value: "tailor", label: "Style Masters (Tailor)" },
  { value: "artist", label: "Entertainment (Artist)" },
  { value: "barber", label: "Barber" },
  { value: "beauty", label: "Beauty & Salon" },
  { value: "wellness", label: "Wellness & Spa" },
];
