import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const THAI_SCRIPT_RE = /[\u0E00-\u0E7F]/;

export type ReceiptFonts = { thai: PDFFont; latin: PDFFont };

type TextRun = { text: string; thai: boolean };

function splitScriptRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let buf = '';
  let thai: boolean | null = null;
  for (const ch of text) {
    const isThai = THAI_SCRIPT_RE.test(ch);
    if (thai === null) {
      thai = isThai;
      buf = ch;
      continue;
    }
    if (isThai === thai) buf += ch;
    else {
      runs.push({ text: buf, thai });
      buf = ch;
      thai = isThai;
    }
  }
  if (buf) runs.push({ text: buf, thai: thai ?? false });
  return runs;
}

export async function embedReceiptFonts(
  pdf: PDFDocument,
  thaiBytes: Uint8Array,
  latinBytes?: Uint8Array,
): Promise<ReceiptFonts> {
  pdf.registerFontkit(fontkit);
  const thai = await pdf.embedFont(thaiBytes, { subset: true });
  const latin = latinBytes ? await pdf.embedFont(latinBytes, { subset: true }) : thai;
  return { thai, latin };
}

export function drawMixedText(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  size: number,
  fonts: ReceiptFonts,
  color: ReturnType<typeof rgb>,
) {
  let cx = x;
  for (const run of splitScriptRuns(text)) {
    if (!run.text) continue;
    const font = run.thai ? fonts.thai : fonts.latin;
    page.drawText(run.text, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(run.text, size);
  }
}
