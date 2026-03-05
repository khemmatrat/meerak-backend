// backend/src/jobs/logistics/logistics.validator.ts
// Validation for Logistics

import { VehicleType, VEHICLE_RATES } from './logistics.types';

export class LogisticsValidator {
  static validate(details: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate vehicle_type
    const validVehicleTypes: VehicleType[] = ['motorcycle', 'sedan', 'pickup', 'truck_6wheeler', 'truck_10wheeler', 'truck_18wheeler'];
    if (!details.vehicle_type || !validVehicleTypes.includes(details.vehicle_type)) {
      errors.push(`vehicle_type must be one of: ${validVehicleTypes.join(', ')}`);
    }

    // Validate distance_km
    if (!details.distance_km || details.distance_km < 0) {
      errors.push('distance_km is required and must be non-negative');
    }

    // Validate weight_kg
    if (!details.weight_kg || details.weight_kg < 0) {
      errors.push('weight_kg is required and must be non-negative');
    }

    // Check weight against vehicle capacity
    if (details.vehicle_type && details.weight_kg) {
      const vehicleRate = VEHICLE_RATES[details.vehicle_type as VehicleType];
      if (vehicleRate && details.weight_kg > vehicleRate.max_weight_kg) {
        errors.push(`Weight ${details.weight_kg}kg exceeds maximum capacity ${vehicleRate.max_weight_kg}kg for ${details.vehicle_type}`);
      }
    }

    // Validate pickup_location
    if (!details.pickup_location) {
      errors.push('pickup_location is required');
    } else {
      if (typeof details.pickup_location.lat !== 'number' || typeof details.pickup_location.lng !== 'number') {
        errors.push('pickup_location must have lat and lng as numbers');
      }
      if (!details.pickup_location.address || typeof details.pickup_location.address !== 'string') {
        errors.push('pickup_location.address is required');
      }
    }

    // Validate delivery_locations
    if (!details.delivery_locations || !Array.isArray(details.delivery_locations) || details.delivery_locations.length === 0) {
      errors.push('delivery_locations must be a non-empty array');
    } else {
      details.delivery_locations.forEach((loc: any, index: number) => {
        if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
          errors.push(`delivery_locations[${index}] must have lat and lng as numbers`);
        }
        if (!loc.address || typeof loc.address !== 'string') {
          errors.push(`delivery_locations[${index}].address is required`);
        }
      });
    }

    // Validate multi_drop
    if (typeof details.multi_drop !== 'boolean') {
      errors.push('multi_drop must be a boolean');
    }

    // Validate fragile
    if (typeof details.fragile !== 'boolean') {
      errors.push('fragile must be a boolean');
    }

    // Validate requires_insurance
    if (typeof details.requires_insurance !== 'boolean') {
      errors.push('requires_insurance must be a boolean');
    }

    // Validate insurance_coverage if requires_insurance is true
    if (details.requires_insurance) {
      if (!details.insurance_coverage || details.insurance_coverage < 0) {
        errors.push('insurance_coverage is required and must be non-negative when requires_insurance is true');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
