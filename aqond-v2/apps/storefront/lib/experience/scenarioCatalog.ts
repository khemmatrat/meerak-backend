/**
 * PV Scenario catalog — Business Impact + Time Saved baselines per scenario.
 * Used by telemetry, tracker rollups, and executive dashboards.
 */

export type BusinessImpact = 'critical' | 'high' | 'medium' | 'low';

export type ScenarioBusinessMeta = {
  scenario_id: string;
  mission_id: string;
  surface: string;
  title: string;
  business_impact: BusinessImpact;
  /** Estimated minutes returned to humans per successful session (baseline). */
  time_saved_minutes: number;
  module: string;
};

export const BUSINESS_IMPACT_LABEL: Record<BusinessImpact, string> = {
  critical: '🔴 Critical',
  high: '🟢 สูง',
  medium: '🟡 กลาง',
  low: '⚪ ต่ำ',
};

/** Wave 1 + platform modules — expand as scenarios are added. */
export const SCENARIO_BUSINESS_CATALOG: Record<string, ScenarioBusinessMeta> = {
  S001: {
    scenario_id: 'S001',
    mission_id: 'M-001',
    surface: 'home',
    title: 'Open storefront home',
    business_impact: 'high',
    time_saved_minutes: 18,
    module: 'marketplace',
  },
  S002: {
    scenario_id: 'S002',
    mission_id: 'M-001',
    surface: 'search',
    title: 'Find & decide',
    business_impact: 'high',
    time_saved_minutes: 6,
    module: 'marketplace',
  },
  S003: {
    scenario_id: 'S003',
    mission_id: 'M-001',
    surface: 'product',
    title: 'Product detail — decide to buy',
    business_impact: 'high',
    time_saved_minutes: 8,
    module: 'marketplace',
  },
  S004: {
    scenario_id: 'S004',
    mission_id: 'M-001',
    surface: 'cart_add',
    title: 'Add to cart',
    business_impact: 'high',
    time_saved_minutes: 5,
    module: 'marketplace',
  },
  S005: {
    scenario_id: 'S005',
    mission_id: 'M-001',
    surface: 'cart_view',
    title: 'View cart',
    business_impact: 'high',
    time_saved_minutes: 7,
    module: 'marketplace',
  },
  S006: {
    scenario_id: 'S006',
    mission_id: 'M-001',
    surface: 'checkout',
    title: 'Checkout start',
    business_impact: 'critical',
    time_saved_minutes: 24,
    module: 'marketplace',
  },
  S007: {
    scenario_id: 'S007',
    mission_id: 'M-001',
    surface: 'place_order',
    title: 'Place order',
    business_impact: 'critical',
    time_saved_minutes: 28,
    module: 'marketplace',
  },
  S038: {
    scenario_id: 'S038',
    mission_id: 'M-005',
    surface: 'payment',
    title: 'Checkout payment QR',
    business_impact: 'critical',
    time_saved_minutes: 24,
    module: 'marketplace',
  },
  S043: {
    scenario_id: 'S043',
    mission_id: 'M-006',
    surface: 'notifications',
    title: 'Notification settings',
    business_impact: 'medium',
    time_saved_minutes: 4,
    module: 'notification',
  },
  S016: {
    scenario_id: 'S016',
    mission_id: 'M-002',
    surface: 'food_home',
    title: 'Food home',
    business_impact: 'high',
    time_saved_minutes: 12,
    module: 'food',
  },
};

export function getScenarioBusinessMeta(scenarioId: string): ScenarioBusinessMeta | null {
  return SCENARIO_BUSINESS_CATALOG[scenarioId] ?? null;
}

export function businessImpactWeight(impact: BusinessImpact): number {
  switch (impact) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}

/** Priority score for triage: experience gap × business weight */
export function businessPriorityScore(experienceScore: number, impact: BusinessImpact): number {
  const gap = Math.max(0, 10 - experienceScore);
  return Math.round(gap * businessImpactWeight(impact) * 10) / 10;
}
