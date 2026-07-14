export const VERTICAL_CAPABILITIES = Object.freeze([
  'text_generation',
  'video_generation',
  'image_generation',
  'resume_generation',
  'marketplace_generation',
  'travel_generation',
  'hotel_generation',
  'food_generation',
  'insurance_generation',
]);

export const CAPABILITY_RUNTIME_MAP = Object.freeze({
  text_generation:         ['writing', 'text.generate'],
  video_generation:        ['video.talent_intro', 'video.generate'],
  image_generation:        ['image.generate', 'creative.render'],
  resume_generation:       ['profile.analyze', 'ocr.pdf'],
  marketplace_generation:  ['catalog.generate', 'listing.create'],
  travel_generation:       ['travel.plan', 'itinerary.generate'],
  hotel_generation:        ['hotel.search', 'booking.generate'],
  food_generation:         ['menu.generate', 'recipe.create'],
  insurance_generation:    ['policy.generate', 'coverage.analyze'],
});

export function createSkillCapability({ runtime } = {}) {
  return {
    listCapabilities() {
      return VERTICAL_CAPABILITIES.map((id) => ({
        id,
        runtimeCapabilities: CAPABILITY_RUNTIME_MAP[id] || [id],
      }));
    },

    resolveRuntimeCapabilities(manifestCapabilities = []) {
      const caps = new Set();
      for (const cap of manifestCapabilities) {
        const mapped = CAPABILITY_RUNTIME_MAP[cap] || [cap];
        mapped.forEach((c) => caps.add(c));
      }
      return [...caps];
    },

    findSkillsByCapability(capability, skills = []) {
      return skills.filter((s) => (s.manifest?.capabilities || []).includes(capability));
    },

    lookup(capability) {
      const registry = runtime?.skills?.registry;
      const skills = registry?.listSkills?.() || [];
      const matched = this.findSkillsByCapability(capability, skills.filter((s) => s.enabled));
      const runtimeCaps = CAPABILITY_RUNTIME_MAP[capability] || [capability];
      return {
        capability,
        runtimeCapabilities: runtimeCaps,
        matchedSkills: matched.map((s) => s.id),
        runtimeDriven: true,
      };
    },
  };
}
