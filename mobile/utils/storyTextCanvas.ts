/** Render text / ชวนคุย story to PNG (9:16) */

export const STORY_GRADIENTS: [string, string][] = [
  ["#1e3a8a", "#7c3aed"],
  ["#7c3aed", "#db2777"],
  ["#db2777", "#ea580c"],
  ["#ea580c", "#eab308"],
  ["#059669", "#0d9488"],
  ["#0f172a", "#334155"],
  ["#be185d", "#7c2d12"],
  ["#0369a1", "#4f46e5"],
];

export const TEXT_COLORS = [
  "#ffffff",
  "#0f172a",
  "#fef08a",
  "#fda4af",
  "#a5f3fc",
  "#c4b5fd",
];

export type TextFontStyle = "modern" | "classic" | "signature";

export interface TextStoryRenderOptions {
  bgIndex?: number;
  fontStyle?: TextFontStyle;
  textColor?: string;
  textAlign?: "center" | "left" | "right";
  /** ชวนคุย — สติกเกอร์แบบ IG */
  chatPrompt?: string;
}

/** @deprecated use STORY_GRADIENTS */
export const BG_COLORS = STORY_GRADIENTS.map(([a]) => a);

function fontForStyle(style: TextFontStyle, size: number): string {
  switch (style) {
    case "classic":
      return `600 ${size}px Georgia, "Times New Roman", serif`;
    case "signature":
      return `italic 600 ${size}px "Segoe Script", "Brush Script MT", cursive`;
    default:
      return `bold ${size}px system-ui, -apple-system, sans-serif`;
  }
}

function drawGradientBg(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bgIndex: number,
) {
  const [c1, c2] = STORY_GRADIENTS[bgIndex % STORY_GRADIENTS.length];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const lines: string[] = [];
  for (const paragraph of raw.split("\n")) {
    let current = "";
    for (const ch of paragraph) {
      const test = current + ch;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = ch;
        if (lines.length >= maxLines) return lines;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, maxLines);
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
  fontStyle: TextFontStyle,
  textColor: string,
  textAlign: "center" | "left" | "right",
) {
  const fontSize = Math.min(
    88,
    Math.max(40, Math.floor(900 / Math.max(1, text.trim().length / 4))),
  );
  ctx.fillStyle = textColor;
  ctx.textAlign = textAlign;
  ctx.textBaseline = "middle";
  ctx.font = fontForStyle(fontStyle, fontSize);

  const maxWidth = w * 0.76;
  const lines = wrapTextLines(ctx, text, maxWidth, 12);
  const lineHeight = fontSize * 1.28;
  const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2;
  const x =
    textAlign === "left" ? w * 0.12 : textAlign === "right" ? w * 0.88 : w / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line.slice(0, 80), x, startY + i * lineHeight, maxWidth);
  });
}

export function renderTextStoryToBlob(
  text: string,
  options: TextStoryRenderOptions | number = 0,
): Promise<Blob> {
  const opts: TextStoryRenderOptions =
    typeof options === "number" ? { bgIndex: options } : options;
  const bgIndex = opts.bgIndex ?? 0;
  const fontStyle = opts.fontStyle ?? "modern";
  const textColor = opts.textColor ?? "#ffffff";
  const textAlign = opts.textAlign ?? "center";

  const w = 1080;
  const h = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas unsupported"));

  drawGradientBg(ctx, w, h, bgIndex);

  const body = text.trim();
  if (body) {
    drawWrappedText(ctx, body, w, h, fontStyle, textColor, textAlign);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("ไม่สามารถสร้างรูปข้อความได้"));
      },
      "image/jpeg",
      0.88,
    );
  });
}
