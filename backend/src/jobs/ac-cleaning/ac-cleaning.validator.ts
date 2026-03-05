// backend/src/jobs/ac-cleaning/ac-cleaning.validator.ts
// Validation for AC Cleaning

import { ACType, ServiceType } from './ac-cleaning.types';

export class ACCleaningValidator {
  static validate(details: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate unit_count
    if (!details.unit_count || details.unit_count < 1) {
      errors.push('unit_count is required and must be at least 1');
    }

    // Validate ac_units
    if (!details.ac_units || !Array.isArray(details.ac_units) || details.ac_units.length === 0) {
      errors.push('ac_units must be a non-empty array');
    } else {
      const validACTypes: ACType[] = ['split', 'window', 'central', 'portable'];
      const validServiceTypes: ServiceType[] = ['regular_clean', 'deep_clean', 'refill_gas', 'repair'];

      details.ac_units.forEach((unit: any, index: number) => {
        if (!unit.btu || typeof unit.btu !== 'number' || unit.btu < 0) {
          errors.push(`ac_units[${index}].btu is required and must be a non-negative number`);
        }
        if (!unit.type || !validACTypes.includes(unit.type)) {
          errors.push(`ac_units[${index}].type must be one of: ${validACTypes.join(', ')}`);
        }
        if (!unit.service_type || !validServiceTypes.includes(unit.service_type)) {
          errors.push(`ac_units[${index}].service_type must be one of: ${validServiceTypes.join(', ')}`);
        }
      });

      // Validate unit_count matches ac_units length
      if (details.unit_count !== details.ac_units.length) {
        errors.push(`unit_count (${details.unit_count}) must match ac_units array length (${details.ac_units.length})`);
      }
    }

    // Validate requires_ladder
    if (typeof details.requires_ladder !== 'boolean') {
      errors.push('requires_ladder must be a boolean');
    }

    // Validate floor (optional but must be number if provided)
    if (details.floor !== undefined && (typeof details.floor !== 'number' || details.floor < 1)) {
      errors.push('floor must be a positive number if provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
