// backend/src/jobs/base/job.validator.ts
// Base validator that routes to category-specific validators

import { JobCategoryType } from './job.types';
import { MaidValidator } from '../maid/maid.validator';
import { DetectiveValidator } from '../detective/detective.validator';
import { LogisticsValidator } from '../logistics/logistics.validator';
import { ACCleaningValidator } from '../ac-cleaning/ac-cleaning.validator';

export class JobValidator {
  static validate(categoryType: JobCategoryType, details: any): { valid: boolean; errors: string[] } {
    switch (categoryType) {
      case 'maid':
        return MaidValidator.validate(details);
      case 'detective':
        return DetectiveValidator.validate(details);
      case 'logistics':
        return LogisticsValidator.validate(details);
      case 'ac_cleaning':
        return ACCleaningValidator.validate(details);
      default:
        return {
          valid: false,
          errors: [`Invalid category type: ${categoryType}`]
        };
    }
  }
}
