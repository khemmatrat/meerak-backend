export function createAgentConversation({ memory } = {}) {
  const messages = memory?._conversation || [];

  return {
    post({ from, to, content, meta = {} }) {
      const msg = {
        id:      `msg-${messages.length + 1}`,
        from,
        to:      to || 'orchestrator',
        content,
        meta,
        at:      new Date().toISOString(),
      };
      messages.push(msg);
      return msg;
    },

    list({ limit = 100 } = {}) {
      return messages.slice(-limit).map((m) => ({ ...m }));
    },

    last(from) {
      const filtered = from ? messages.filter((m) => m.from === from) : messages;
      return filtered.length ? { ...filtered[filtered.length - 1] } : null;
    },
  };
}
