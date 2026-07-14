/**
 * Sprint 33 — Persona section for Jarvis prompts (ai-core)
 */

export function personaSectionFromContext(ctx = {}) {
  const persona = ctx.jarvis_persona;
  if (!persona) return '';
  if (persona.prompt_section) return `\n${persona.prompt_section}\n`;
  return '';
}

export function jarvisSystemIntroWithPersona(baseIntro, ctx = {}) {
  const section = personaSectionFromContext(ctx);
  if (!section) return baseIntro;
  return `${baseIntro}\n${section}`;
}
