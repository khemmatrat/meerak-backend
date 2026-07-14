/**
 * Notification Engine – sends notifications for automation events
 * (job complete, approval needed, goal reached, error alert, etc.).
 *
 * Channels: in-memory queue (stub), extensible to email/Slack/webhook.
 */
export function createNotificationEngine(deps = {}) {
  const channels  = new Map(); // channelId -> { send(notification) }
  const queue     = [];
  const sent      = [];

  /** Register a notification channel. */
  function registerChannel(id, handler) {
    if (typeof handler !== 'function') throw new Error('channel_handler_must_be_function');
    channels.set(id, { id, send: handler });
  }

  /**
   * Send a notification to one or all channels.
   * @param {{ type, title, body, meta?, channels? }} notification
   */
  async function send({ type, title, body, meta = {}, channels: targetChannels = null }) {
    const notification = { type, title, body, meta, ts: new Date().toISOString(), id: `notif_${Date.now()}` };
    queue.push(notification);

    const targets = targetChannels
      ? [...channels.entries()].filter(([k]) => targetChannels.includes(k))
      : [...channels.entries()];

    const results = [];
    for (const [id, ch] of targets) {
      let result;
      try { result = await ch.send(notification); } catch (err) { result = { error: err.message }; }
      results.push({ channel: id, result });
    }

    sent.push({ ...notification, deliveries: results });
    return { notificationId: notification.id, deliveries: results };
  }

  function getSent()  { return [...sent]; }
  function getQueue() { return [...queue]; }

  return { registerChannel, send, getSent, getQueue };
}

export default createNotificationEngine;
