import { NextRequest, NextResponse } from 'next/server';
import { advanceDispatchPhase } from '@/lib/server/dispatchSvc';
import { listRiderIncidents, saveRiderVoiceIncident, touchRiderAiSession } from '@/lib/server/aiTier3Store';
import { riderVoiceProfile } from '@aqond/voice/riderConvergence';

const RIDER_PHASE_LABELS: Record<string, string> = {
  pending_accept: 'รอยืนยันรับงาน',
  rider_assigned: 'ไปรับที่ร้าน',
  rider_picked_up: 'รับของแล้ว — ออกเดินทาง',
  en_route: 'กำลังนำไปส่ง',
  arrived: 'ถึงที่หมาย',
  rider_completed: 'ส่งสำเร็จ',
};

const INCIDENT_KEYWORDS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /อุบัติ|ชน|รถเสีย|เจ็บ|ฉุกเฉิน|sos/i, category: 'emergency' },
  { pattern: /ที่อยู่ผิด|หาบ้านไม่เจอ|ลูกค้าไม่อยู่/i, category: 'address' },
  { pattern: /ร้านปิด|รอนาน|ร้านไม่ตอบ/i, category: 'merchant_delay' },
];

function parseRiderVoice(transcript: string, phase: string) {
  const t = transcript.trim().toLowerCase();
  if (!t) return { action: 'none', reply_th: 'ไม่ได้ยินคำสั่งครับ — ลองพูดอีกครั้ง' };

  for (const { pattern, category } of INCIDENT_KEYWORDS) {
    if (pattern.test(t)) {
      return {
        action: 'incident',
        category,
        reply_th: 'บันทึกเหตุการณ์แล้วครับ — ทีมซัพพอร์ตจะติดตาม',
      };
    }
  }

  if (/รับของ|ถึงร้าน|pick/.test(t)) {
    return { action: 'advance', phase: 'rider_picked_up', reply_th: 'อัปเดต: รับของแล้วครับ' };
  }
  if (/ออกเดินทาง|ไปส่ง|en route/.test(t)) {
    return { action: 'advance', phase: 'en_route', reply_th: 'อัปเดต: กำลังนำไปส่งครับ' };
  }
  if (/ถึงแล้ว|ถึงที่|arrived/.test(t)) {
    return { action: 'advance', phase: 'arrived', reply_th: 'อัปเดต: ถึงที่หมายแล้วครับ' };
  }
  if (/ส่งสำเร็จ|ส่งแล้ว|complete/.test(t)) {
    return { action: 'advance', phase: 'rider_completed', reply_th: 'อัปเดต: ส่งสำเร็จครับ' };
  }
  if (/ถัดไป|next|ขั้นตอน/.test(t)) {
    const flow = Object.keys(RIDER_PHASE_LABELS);
    const i = flow.indexOf(phase);
    const next = i >= 0 && i + 1 < flow.length ? flow[i + 1] : 'en_route';
    return {
      action: 'advance',
      phase: next,
      reply_th: `ขั้นตอนถัดไป: ${RIDER_PHASE_LABELS[next] || next}`,
    };
  }
  if (/นำทาง|ไปร้าน|ร้าน/.test(t)) {
    return {
      action: 'navigate',
      reply_th: 'เปิดแผนที่นำทางไปร้านได้ที่ปุ่มโทร/แชท — หรือพูด "รับของแล้ว" เมื่อถึงร้านครับ',
    };
  }

  return {
    action: 'none',
    reply_th: `คำสั่งเสียง: พูด "รับของแล้ว", "ถึงแล้ว", "ส่งสำเร็จ" หรือรายงานเหตุฉุกเฉินได้ครับ (ตอนนี้: ${RIDER_PHASE_LABELS[phase] || phase})`,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const transcript = String(body.transcript || body.text || '').trim();
  const riderId = String(body.rider_id || '');
  const jobId = String(body.job_id || '');
  const orderId = String(body.order_id || '');
  const phase = String(body.phase || 'rider_assigned');
  const lat = body.lat != null ? Number(body.lat) : undefined;
  const lng = body.lng != null ? Number(body.lng) : undefined;

  if (!transcript) {
    return NextResponse.json({ error: 'transcript required' }, { status: 400 });
  }

  const parsed = parseRiderVoice(transcript, phase);

  if (parsed.action === 'incident') {
    const incident = await saveRiderVoiceIncident({
      rider_id: riderId || 'unknown-rider',
      job_id: jobId || undefined,
      order_id: orderId || undefined,
      transcript,
      category: parsed.category || 'general',
      lat,
      lng,
    });
    return NextResponse.json({
      ok: true,
      action: 'incident',
      category: parsed.category,
      reply_th: parsed.reply_th,
      incident,
    });
  }

  if (riderId) {
    await touchRiderAiSession({
      rider_id: riderId,
      job_id: jobId || undefined,
      context: { last_transcript: transcript, last_phase: phase, last_action: parsed.action },
    });
  }

  if (parsed.action === 'advance' && jobId && riderId && parsed.phase) {
    try {
      const data = await advanceDispatchPhase(jobId, { phase: parsed.phase, rider_id: riderId });
      if (!data) {
        const localDev = process.env.AQOND_LOCAL_DEV === '1' || process.env.AQOND_ALLOW_LOCAL_ORDERS === '1';
        if (localDev || jobId.startsWith('job-demo')) {
          return NextResponse.json({
            ok: true,
            action: 'advance',
            phase: parsed.phase,
            reply_th: parsed.reply_th,
            dry_run: true,
            job: {
              id: jobId,
              order_id: orderId || 'ord-demo',
              phase: parsed.phase,
              status: parsed.phase === 'rider_completed' ? 'completed' : 'active',
              rider_id: riderId,
            },
          });
        }
        throw new Error('dispatch_unavailable');
      }
      return NextResponse.json({
        ok: true,
        action: 'advance',
        phase: parsed.phase,
        reply_th: parsed.reply_th,
        job: data.job,
      });
    } catch (e: unknown) {
      return NextResponse.json({
        ok: false,
        error: e instanceof Error ? e.message : 'advance_failed',
        reply_th: 'อัปเดตสถานะไม่สำเร็จครับ',
      }, { status: 400 });
    }
  }

  return NextResponse.json({
    ok: true,
    action: parsed.action,
    reply_th: parsed.reply_th,
  });
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('job_id') || undefined;
  const incidents = await listRiderIncidents(jobId, 10);
  return NextResponse.json({
    ok: true,
    service: 'rider-voice',
    voice_profile: riderVoiceProfile(),
    commands: ['รับของแล้ว', 'ถึงแล้ว', 'ส่งสำเร็จ', 'รายงานอุบัติเหตุ'],
    incidents,
  });
}
