// Cliente reutilizable para el proxy de IA (/api/ai/chat) con streaming SSE.
// Devuelve el texto completo y llama onDelta(full, chunk) en cada fragmento.
export async function streamChat({ settings, messages, temperature, maxTokens, signal, onDelta }) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      messages,
      temperature: temperature ?? settings.temperature ?? 0.8,
      maxTokens: maxTokens ?? settings.maxTokens ?? 8192,
      stream: true
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta
        if (delta?.content) {
          full += delta.content
          onDelta?.(full, delta.content)
        }
      } catch {}
    }
  }

  return full
}
