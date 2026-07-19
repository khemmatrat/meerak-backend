import type { TalentChatConversation } from '@/lib/talent/talentChatTypes';
import { ChatConversationItem } from '@/components/talent/chat/ChatConversationItem';

type Props = {
  title: string;
  items: TalentChatConversation[];
  emptyLabel?: string;
};

export function ChatConversationList({ title, items, emptyLabel = 'ไม่มีรายการ' }: Props) {
  if (!items.length) {
    return (
      <section className="tt-talent-chat-section">
        <h3 className="tt-talent-chat-section-title">{title}</h3>
        <p className="tt-hint">{emptyLabel}</p>
      </section>
    );
  }

  return (
    <section className="tt-talent-chat-section" aria-label={title}>
      <h3 className="tt-talent-chat-section-title">
        {title} ({items.length})
      </h3>
      <ul className="tt-talent-chat-list">
        {items.map((c) => (
          <ChatConversationItem key={c.id} conversation={c} />
        ))}
      </ul>
    </section>
  );
}
