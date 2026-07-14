const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://ollama:11434";

export async function ollamaHealth() {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { ok: false, error: `status ${r.status}` };
    const data = await r.json();
    return { ok: true, models: (data.models || []).map((m) => m.name) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function chat({ model, messages, images = [], format, keepAlive = "0", options = {} }) {
  const body = {
    model,
    messages,
    stream: false,
    keep_alive: keepAlive,
    options: {
      num_ctx: 2048,
      num_predict: images.length ? 280 : 512,
      temperature: 0.3,
      ...options,
    },
  };
  if (images.length) {
    body.messages = messages.map((m, i) =>
      i === messages.length - 1 ? { ...m, images } : m,
    );
  }
  if (format) body.format = format;

  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS || 300000)),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`ollama chat failed: ${r.status} ${err}`);
  }
  const data = await r.json();
  return data.message?.content || "";
}

export async function generate({ model, prompt, format, keepAlive = "0" }) {
  const body = { model, prompt, stream: false, keep_alive: keepAlive };
  if (format) body.format = format;
  const r = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS || 300000)),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`ollama generate failed: ${r.status} ${err}`);
  }
  const data = await r.json();
  return data.response || "";
}
