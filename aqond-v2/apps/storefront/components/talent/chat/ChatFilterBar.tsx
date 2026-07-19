'use client';

import type { TalentChatFilterId } from '@/lib/talent/talentChatTypes';
import { TALENT_CHAT_FILTERS } from '@/lib/talent/talentChatTypes';

type Props = {
  active: TalentChatFilterId;
  onChange: (filter: TalentChatFilterId) => void;
};

export function ChatFilterBar({ active, onChange }: Props) {
  return (
    <div className="tt-talent-chat-filters" role="tablist" aria-label="กรองแชท">
      {TALENT_CHAT_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          className={active === f.id ? 'active' : ''}
          aria-selected={active === f.id}
          onClick={() => onChange(f.id)}
        >
          <span aria-hidden>{f.icon}</span>
          <span>{f.label}</span>
        </button>
      ))}
    </div>
  );
}
