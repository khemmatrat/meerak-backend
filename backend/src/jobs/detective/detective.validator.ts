// backend/src/jobs/detective/detective.validator.ts
// Validation for Private Detective

export class DetectiveValidator {
  static validate(details: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate duration_days
    if (!details.duration_days || details.duration_days < 1) {
      errors.push('duration_days is required and must be at least 1');
    }

    // Validate confidentiality_level
    if (!details.confidentiality_level || !['standard', 'high', 'maximum'].includes(details.confidentiality_level)) {
      errors.push('confidentiality_level must be "standard", "high", or "maximum"');
    }

    // Validate investigation_type
    if (!details.investigation_type || typeof details.investigation_type !== 'string') {
      errors.push('investigation_type is required');
    }

    // Validate locations
    if (!details.locations || !Array.isArray(details.locations) || details.locations.length === 0) {
      errors.push('locations must be a non-empty array');
    }

    // Validate expenses (optional but must be numbers if provided)
    if (details.travel_expenses !== undefined && typeof details.travel_expenses !== 'number') {
      errors.push('travel_expenses must be a number');
    }
    if (details.accommodation !== undefined && typeof details.accommodation !== 'number') {
      errors.push('accommodation must be a number');
    }
    if (details.other_expenses !== undefined && typeof details.other_expenses !== 'number') {
      errors.push('other_expenses must be a number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
