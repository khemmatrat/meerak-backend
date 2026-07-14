import { BUILTIN_APPLICATIONS, getApplicationTemplate } from './applicationTemplate.js';

export function createApplicationCatalog() {
  return {
    list() {
      return BUILTIN_APPLICATIONS.map((a) => ({ ...a }));
    },

    get(id) {
      return getApplicationTemplate(id);
    },

    categories() {
      return [...new Set(BUILTIN_APPLICATIONS.map((a) => a.category))];
    },
  };
}
