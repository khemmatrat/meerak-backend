import { redirect } from 'next/navigation';

export default function HelpRedirectPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = new URLSearchParams();
  if (!searchParams.channel) q.set('channel', 'MKP');
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string') q.set(k, v);
  }
  redirect(`/m/support?${q.toString()}`);
}
