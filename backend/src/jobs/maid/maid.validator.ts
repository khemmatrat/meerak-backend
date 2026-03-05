// backend/src/jobs/maid/maid.validator.ts
// Validation for Maid Service

import { MaidJobDetails } from './maid.types';

export class MaidValidator {
  static validate(details: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate frequency
    if (!details.frequency || !['hourly', 'daily'].includes(details.frequency)) {
      errors.push('frequency must be "hourly" or "daily"');
    }

    // Validate hours/days based on frequency
    if (details.frequency === 'hourly') {
      if (!details.hours || details.hours < 1) {
        errors.push('hours is required and must be at least 1 when frequency is hourly');
      }
    } else if (details.frequency === 'daily') {
      if (!details.days || details.days < 1) {
        errors.push('days is required and must be at least 1 when frequency is daily');
      }
    }

    // Validate rooms
    if (!details.rooms) {
      errors.push('rooms object is required');
    } else {
      if (typeof details.rooms.bedroom !== 'number' || details.rooms.bedroom < 0) {
        errors.push('rooms.bedroom must be a non-negative number');
      }
      if (typeof details.rooms.bathroom !== 'number' || details.rooms.bathroom < 0) {
        errors.push('rooms.bathroom must be a non-negative number');
      }
      if (typeof details.rooms.living_room !== 'number' || details.rooms.living_room < 0) {
        errors.push('rooms.living_room must be a non-negative number');
      }
      if (typeof details.rooms.kitchen !== 'boolean') {
        errors.push('rooms.kitchen must be a boolean');
      }
    }

    // Validate equipment_provided
    if (typeof details.equipment_provided !== 'boolean') {
      errors.push('equipment_provided must be a boolean');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
