import { NextResponse } from 'next/server';
import { renderEnginePreview } from '@/lib/server/receiptEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const preview = await renderEnginePreview();
  if (!preview.validation.ok) {
    return NextResponse.json({ ok: false, validation: preview.validation }, { status: 500 });
  }

  return new NextResponse(Buffer.from(preview.pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="aqond-receipt-engine-preview.pdf"',
      'Cache-Control': 'no-store',
      'X-Aqond-Receipt-Core': 'receipt-core',
    },
  });
}
