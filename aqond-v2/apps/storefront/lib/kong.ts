const REGION = process.env.NEXT_PUBLIC_AQOND_REGION || 'TH';

export async function collectCoupon(userId: string, code: string) {
  const res = await fetch('/api/kong/coupons/v1/coupons/collect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Aqond-Region': REGION,
    },
    body: JSON.stringify({ user_id: userId, code }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
