import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function GET(
  _req: NextRequest,
  ctx: { params: { merchantId: string; file: string } },
) {
  const { merchantId, file } = ctx.params;
  if (file.includes('..') || merchantId.includes('..')) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const filePath = path.join(process.cwd(), '.data', 'dev', 'merchant-ad-uploads', merchantId, file);
  try {
    const buf = await fs.readFile(filePath);
    const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return new NextResponse(buf, {
      headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
