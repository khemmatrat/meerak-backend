import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const OUT_DIR = path.join(process.cwd(), '.data', 'dev', 'merchant-ad-output');

export async function GET(
  _req: NextRequest,
  ctx: { params: { jobId: string; file: string } },
) {
  const { jobId, file } = ctx.params;
  if (!/^adv-[a-f0-9]+$/.test(jobId) || file.includes('..')) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
  }
  const filePath = path.join(OUT_DIR, jobId, file);
  try {
    const buf = await fs.readFile(filePath);
    const type = file.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
    return new NextResponse(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
