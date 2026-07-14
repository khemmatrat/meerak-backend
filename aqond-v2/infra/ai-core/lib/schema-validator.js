import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const productSchema = JSON.parse(
  readFileSync(join(__dirname, "../schemas/product-onboard.json"), "utf8"),
);
const slaJudgeSchema = JSON.parse(
  readFileSync(join(__dirname, "../schemas/sla-judge.json"), "utf8"),
);
const liveCloserSchema = JSON.parse(
  readFileSync(join(__dirname, "../schemas/live-closer.json"), "utf8"),
);
const crewRerankSchema = JSON.parse(
  readFileSync(join(__dirname, "../schemas/crew-rerank.json"), "utf8"),
);

function typeOf(v) {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  return typeof v;
}

export function normalizeProductOnboard(data) {
  if (!data || typeof data !== "object") return data;
  const out = { ...data };

  if (!out.title && out.product_name) out.title = out.product_name;
  if (!out.title && out.name) out.title = out.name;
  if (out.price_thb == null && out.price != null) out.price_thb = Number(out.price);
  if (out.price_thb == null && out.priceThb != null) out.price_thb = Number(out.priceThb);
  if (out.inventory == null && out.qty != null) out.inventory = Number(out.qty);
  if (out.inventory == null && out.stock != null) out.inventory = Number(out.stock);
  if (out.inventory == null && out.quantity != null) out.inventory = Number(out.quantity);

  if (typeof out.price_thb === "string") {
    out.price_thb = Number(String(out.price_thb).replace(/[^\d.]/g, "")) || 0;
  }
  if (typeof out.inventory === "string") {
    out.inventory = parseInt(String(out.inventory).replace(/\D/g, ""), 10);
  }
  if (out.inventory == null || out.inventory === "" || Number.isNaN(out.inventory)) {
    out.inventory = 1;
  }
  out.inventory = Math.max(0, Math.round(Number(out.inventory)));

  if (!out.category || out.category === "") out.category = "general";
  if (!out.description || out.description === "") {
    out.description = out.title ? String(out.title) : "สินค้าจากรูปภาพ";
  }
  if (!Array.isArray(out.tags)) out.tags = [];

  return out;
}

export function validateProductOnboard(data) {
  const errors = [];
  const s = productSchema;

  if (typeOf(data) !== "object" || data === null) {
    return { valid: false, errors: ["root must be object"] };
  }

  for (const key of s.required || []) {
    if (data[key] === undefined || data[key] === null || data[key] === "") {
      errors.push(`missing required: ${key}`);
    }
  }

  const props = s.properties || {};
  for (const [key, rule] of Object.entries(props)) {
    const val = data[key];
    if (val === undefined) continue;
    if (rule.type === "string" && typeOf(val) !== "string") errors.push(`${key} must be string`);
    if (rule.type === "number" && typeOf(val) !== "number") errors.push(`${key} must be number`);
    if (rule.type === "integer" && (!Number.isInteger(val))) errors.push(`${key} must be integer`);
    if (rule.type === "array" && !Array.isArray(val)) errors.push(`${key} must be array`);
    if (rule.minLength && String(val).length < rule.minLength) errors.push(`${key} too short`);
    if (rule.maxLength && String(val).length > rule.maxLength) errors.push(`${key} too long`);
    if (rule.minimum !== undefined && val < rule.minimum) errors.push(`${key} below minimum`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateSlaJudge(data) {
  const errors = [];
  const s = slaJudgeSchema;

  if (typeOf(data) !== "object" || data === null) {
    return { valid: false, errors: ["root must be object"] };
  }

  for (const key of s.required || []) {
    if (data[key] === undefined || data[key] === null) {
      errors.push(`missing required: ${key}`);
    }
  }

  const props = s.properties || {};
  for (const [key, rule] of Object.entries(props)) {
    const val = data[key];
    if (val === undefined) continue;
    if (rule.type === "boolean" && typeOf(val) !== "boolean") errors.push(`${key} must be boolean`);
    if (rule.type === "number" && typeOf(val) !== "number") errors.push(`${key} must be number`);
    if (rule.type === "string" && typeOf(val) !== "string") errors.push(`${key} must be string`);
    if (rule.minimum !== undefined && val < rule.minimum) errors.push(`${key} below minimum`);
    if (rule.maximum !== undefined && val > rule.maximum) errors.push(`${key} above maximum`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateLiveCloser(data) {
  const errors = [];
  const s = liveCloserSchema;

  if (typeOf(data) !== "object" || data === null) {
    return { valid: false, errors: ["root must be object"] };
  }

  for (const key of s.required || []) {
    if (data[key] === undefined || data[key] === null) {
      errors.push(`missing required: ${key}`);
    }
  }

  const props = s.properties || {};
  for (const [key, rule] of Object.entries(props)) {
    const val = data[key];
    if (val === undefined || val === null) continue;
    if (rule.type === "boolean" && typeOf(val) !== "boolean") errors.push(`${key} must be boolean`);
    if (rule.type === "number" && typeOf(val) !== "number") errors.push(`${key} must be number`);
    if (rule.type === "string" && typeOf(val) !== "string") errors.push(`${key} must be string`);
    if (Array.isArray(rule.type) && !rule.type.includes(typeOf(val))) errors.push(`${key} invalid type`);
    if (rule.minimum !== undefined && val < rule.minimum) errors.push(`${key} below minimum`);
    if (rule.maximum !== undefined && val > rule.maximum) errors.push(`${key} above maximum`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateCrewRerank(data) {
  const errors = [];
  const s = crewRerankSchema;

  if (typeOf(data) !== "object" || data === null) {
    return { valid: false, errors: ["root must be object"] };
  }
  if (!Array.isArray(data.ranked)) {
    return { valid: false, errors: ["ranked must be array"] };
  }
  for (const [i, item] of data.ranked.entries()) {
    if (typeOf(item) !== "object" || !item.id) errors.push(`ranked[${i}] missing id`);
    if (typeof item.score !== "number") errors.push(`ranked[${i}] score must be number`);
  }
  return { valid: errors.length === 0, errors };
}

export function parseJsonFromLlm(text) {
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("no JSON object in LLM response");
  }
}
