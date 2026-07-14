/**
 * Template Engine – resolves video layout templates and emits ffmpeg filter args.
 * Templates define aspect ratio, intro/outro presence, branding colours, and fonts.
 */

const BUILTIN_TEMPLATES = {
  default: {
    id: 'default',
    name: 'Default 16:9',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    intro: false,
    outro: false,
    color: '#000000',
    font: 'Arial',
  },
  vertical: {
    id: 'vertical',
    name: 'Vertical 9:16 (TikTok/Reels)',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    intro: false,
    outro: false,
    color: '#000000',
    font: 'Arial',
  },
  branded: {
    id: 'branded',
    name: 'Branded 16:9',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    intro: true,
    outro: true,
    color: '#1a1a2e',
    font: 'Montserrat',
  },
  square: {
    id: 'square',
    name: 'Square 1:1 (Instagram)',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    intro: false,
    outro: false,
    color: '#ffffff',
    font: 'Arial',
  },
};

export function createTemplateEngine(deps = {}) {
  const templates = { ...BUILTIN_TEMPLATES, ...(deps.templates || {}) };

  /** Resolve a template by id; fall back to 'default'. */
  function resolve(templateId) {
    return templates[templateId] || templates.default;
  }

  /**
   * Apply a template to a render context.
   * Returns the enriched context including resolved template metadata and ffmpeg args.
   */
  function apply(templateId, renderContext = {}) {
    const tpl = resolve(templateId);
    const { width: w, height: h } = tpl;
    const vfScale = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;

    const ffmpegArgs = ['-vf', vfScale];

    if (tpl.intro && renderContext.introPath) {
      // concat intro is handled at the mux step; note it here for executor
    }

    return {
      ...renderContext,
      template: tpl,
      ffmpegArgs,
    };
  }

  /** Build raw ffmpeg -vf scale+pad filter string for a template id. */
  function scaleFilter(templateId) {
    const tpl = resolve(templateId);
    return `scale=${tpl.width}:${tpl.height}:force_original_aspect_ratio=decrease,pad=${tpl.width}:${tpl.height}:(ow-iw)/2:(oh-ih)/2`;
  }

  /** List all available templates. */
  function list() {
    return Object.values(templates);
  }

  return { resolve, apply, scaleFilter, list };
}

export default createTemplateEngine;
