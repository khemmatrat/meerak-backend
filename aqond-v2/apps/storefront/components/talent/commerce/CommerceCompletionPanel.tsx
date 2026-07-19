import type { TalentCommerceComposed } from '@/lib/talent/commerce/talentCommerceTypes';

type Props = {
  completion: TalentCommerceComposed['completion'];
};

export function CommerceCompletionPanel({ completion }: Props) {
  return (
    <section className="tt-talent-commerce-completion" aria-label="Completion rate">
      <div className="tt-talent-commerce-section-head">
        <h3>อัตราสำเร็จ</h3>
        <strong>{completion.overallRate != null ? `${completion.overallRate}%` : '—'}</strong>
      </div>
      <div className="tt-talent-commerce-completion-track">
        <div
          className="tt-talent-commerce-completion-fill"
          style={{ width: `${completion.overallRate ?? 0}%` }}
        />
      </div>
      <p className="tt-hint">
        {completion.completed} สำเร็จ · {completion.cancelled} ยกเลิก/ปฏิเสธ
      </p>
      <ul className="tt-talent-commerce-completion-sources">
        {completion.bySource.map((s) => (
          <li key={s.source}>
            <span>{s.label}</span>
            <span>{s.rate != null ? `${s.rate}%` : '—'}</span>
            <span className="tt-hint">
              {s.completed}/{s.completed + s.cancelled}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
