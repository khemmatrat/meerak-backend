import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedProductImage } from '@/lib/server/merchantAdTokens';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  const merchantId = String(form.get('merchant_id') || '');

  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'file_too_large', max_mb: 8 }, { status: 400 });
  }

  const type = file.type || 'image/jpeg';
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const url = await saveUploadedProductImage(merchantId, buffer, ext);
  return NextResponse.json({ ok: true, image_url: url });
}
