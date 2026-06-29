export const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.nano-gpt.com/v1',
  model: 'deepseek/deepseek-r1',
  temperature: 0.8,
  maxTokens: 8192,
  creatorName: '',
  streamingEnabled: true,
  subscriptionOnly: false,
  soundEnabled: true,
  cardSize: 'medium',
  autoImagePrompt: false,
  autoImagePresetId: '',
  userAvatar: '',
  lastMode: 'chat',
  lastPresetId: ''
}

export function createEmptyCard() {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: '',
      description: '',
      personality: '',
      scenario: '',
      first_mes: '',
      mes_example: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      character_book: { entries: [], name: '' },
      tags: [],
      creator: '',
      character_version: '1.0',
      extensions: {}
    }
  }
}

export function normalizeCard(rawCard) {
  const d = rawCard?.data || rawCard
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: d.name || '',
      description: d.description || '',
      personality: d.personality || '',
      scenario: d.scenario || '',
      first_mes: d.first_mes || '',
      mes_example: d.mes_example || '',
      creator_notes: d.creator_notes || '',
      system_prompt: d.system_prompt || '',
      post_history_instructions: d.post_history_instructions || '',
      alternate_greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings : [],
      character_book: d.character_book || { entries: [], name: '' },
      tags: Array.isArray(d.tags) ? d.tags : [],
      creator: d.creator || '',
      character_version: d.character_version || '1.0',
      extensions: d.extensions || {}
    }
  }
}

export function extractCardFromText(text) {
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g
  let match
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.name || parsed.data?.name) {
        return normalizeCard(parsed)
      }
    } catch {}
  }
  // Try raw JSON in the text
  const rawJsonMatch = text.match(/\{[\s\S]*"name"[\s\S]*\}/)
  if (rawJsonMatch) {
    try {
      const parsed = JSON.parse(rawJsonMatch[0])
      if (parsed.name || parsed.data?.name) {
        return normalizeCard(parsed)
      }
    } catch {}
  }
  return null
}

export function cardToStorageItem(card, meta = {}) {
  return {
    _id: crypto.randomUUID(),
    _createdAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
    _meta: {
      presetId: meta.presetId || null,
      presetName: meta.presetName || null,
      mode: meta.mode || 'chat',
      model: meta.model || null,
      provider: meta.provider || null,
      baseUrl: meta.baseUrl || null,
      temperature: meta.temperature ?? null,
      sharedUniverse: meta.sharedUniverse || null
    },
    _relations: Array.isArray(meta.relations) ? meta.relations : [],
    ...card
  }
}

export function downloadCard(card) {
  // Strip internal metadata fields before export
  const { _id, _createdAt, _updatedAt, _meta, _relations, _avatar, _sdPrompt, ...exportCard } = card
  const json = JSON.stringify(exportCard, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${card.data?.name || 'character'}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Preset AI assistant helpers ──
// El asistente devuelve el preset entre marcadores propios (no usamos ```json
// porque el system_prompt generado puede contener bloques de código que romperían
// el parseo anidado).
export function extractPresetFromText(text) {
  const m = text.match(/<<<PRESET_JSON>>>([\s\S]*?)<<<END_PRESET_JSON>>>/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1].trim())
    const p = parsed.preset || parsed
    return {
      name: p.name || '',
      description: p.description || '',
      systemPrompt: p.system_prompt || p.systemPrompt || ''
    }
  } catch {
    return null
  }
}

// Quita los marcadores del preset del texto conversacional mostrado en el chat,
// incluyendo un marcador de apertura parcial mientras se está transmitiendo.
export function stripPresetMarkers(text) {
  let t = text.replace(/<<<PRESET_JSON>>>[\s\S]*?<<<END_PRESET_JSON>>>/g, '')
  const open = t.indexOf('<<<PRESET_JSON>>>')
  if (open !== -1) t = t.slice(0, open)
  // Marcador de apertura aún incompleto (p.ej. "<<<PRES")
  const partial = t.match(/<<<[A-Z_]*$/)
  if (partial) t = t.slice(0, partial.index)
  return t.trim()
}

// ── Shared universe helpers ──
const PROVIDER_MAP = {
  'nano-gpt.com': 'NanoGPT',
  'api.nano-gpt.com': 'NanoGPT',
  'api.openai.com': 'OpenAI',
  'openrouter.ai': 'OpenRouter',
  'api.anthropic.com': 'Anthropic',
  'generativelanguage.googleapis.com': 'Google'
}

export function providerFromBaseUrl(baseUrl) {
  if (!baseUrl) return 'Desconocido'
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, '')
    if (PROVIDER_MAP[host]) return PROVIDER_MAP[host]
    if (host === 'localhost' || host === '127.0.0.1') return 'Local (Ollama/otro)'
    return host
  } catch {
    return baseUrl
  }
}

// Resumen detallado de un personaje para inyectar como contexto a la IA.
export function summarizeCardForContext(card) {
  const d = card.data || {}
  const parts = [`### ${d.name || 'Sin nombre'}`]
  if (d.description) parts.push(`Apariencia/Descripción: ${d.description}`)
  if (d.personality) parts.push(`Personalidad: ${d.personality}`)
  if (d.scenario) parts.push(`Escenario: ${d.scenario}`)
  if (Array.isArray(d.tags) && d.tags.length) parts.push(`Etiquetas: ${d.tags.join(', ')}`)
  return parts.join('\n')
}

// Lista compacta (roster) de todos los personajes para el modo automático.
export function buildRosterSummary(cards) {
  if (!cards.length) return '(todavía no hay personajes en el universo)'
  return cards.map(c => {
    const d = c.data || {}
    const snippet = (d.description || d.personality || '').replace(/\s+/g, ' ').slice(0, 110)
    const tags = d.tags?.length ? ` [${d.tags.slice(0, 4).join(', ')}]` : ''
    return `- ${d.name || 'Sin nombre'}${tags}${snippet ? `: ${snippet}…` : ''}`
  }).join('\n')
}

// Detecta personajes existentes mencionados por nombre en un texto.
export function detectMentionedCards(text, cards) {
  if (!text) return []
  const lower = text.toLowerCase()
  return cards.filter(c => {
    const name = (c.data?.name || '').trim().toLowerCase()
    return name.length >= 2 && lower.includes(name)
  })
}

// ── Multi-character helpers ──
// Sustituye {{char}} por el nombre del personaje (para fusionar varias tarjetas).
export function substituteCharName(text, name) {
  if (!text) return text
  return String(text).replace(/\{\{char\}\}/gi, name)
}

// Perfil de un personaje con {{char}} ya reemplazado por su nombre.
export function buildCharacterProfile(card) {
  const d = card.data || {}
  const name = d.name || 'Personaje'
  const sub = (t) => substituteCharName(t, name)
  const parts = [`### ${name}`]
  if (d.description) parts.push(`Descripción: ${sub(d.description)}`)
  if (d.personality) parts.push(`Personalidad: ${sub(d.personality)}`)
  if (d.scenario) parts.push(`Escenario: ${sub(d.scenario)}`)
  if (d.first_mes) parts.push(`Saludo inicial: ${sub(d.first_mes)}`)
  if (d.mes_example) parts.push(`Ejemplos de diálogo: ${sub(d.mes_example)}`)
  if (Array.isArray(d.tags) && d.tags.length) parts.push(`Etiquetas: ${d.tags.join(', ')}`)
  return parts.join('\n')
}

// ── Translation helper ──
// La traducción vuelve entre marcadores propios para no chocar con bloques de
// código que pudieran aparecer en mes_example.
export function extractTranslatedCard(text) {
  const m = text.match(/<<<CARD_JSON>>>([\s\S]*?)<<<END_CARD_JSON>>>/)
  if (m) {
    try { return JSON.parse(m[1].trim()) } catch { /* fall through */ }
  }
  // Fallback: cualquier bloque JSON válido en el texto
  const block = text.match(/\{[\s\S]*\}/)
  if (block) {
    try { return JSON.parse(block[0]) } catch {}
  }
  return null
}

// Quita los marcadores <<<CARD_JSON>>> del texto conversacional mostrado en el
// chat de edición con IA (incluye marcador de apertura parcial durante streaming).
export function stripCardMarkers(text) {
  let t = (text || '').replace(/<<<CARD_JSON>>>[\s\S]*?<<<END_CARD_JSON>>>/g, '')
  const open = t.indexOf('<<<CARD_JSON>>>')
  if (open !== -1) t = t.slice(0, open)
  const partial = t.match(/<<<[A-Z_]*$/)
  if (partial) t = t.slice(0, partial.index)
  return t.trim()
}

// ── Stable Diffusion prompt helper ──
// Limpia el prompt devuelto por la IA (quita posibles vallas de código).
export function cleanPromptOutput(text) {
  let t = (text || '').trim()
  const fence = t.match(/```(?:[a-zA-Z]*)?\s*([\s\S]*?)\s*```/)
  if (fence) return fence[1].trim()
  return t
}

export function parseThinkingContent(content) {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/s)
  if (thinkMatch) {
    return {
      thinking: thinkMatch[1].trim(),
      clean: content.replace(/<think>[\s\S]*?<\/think>/s, '').trim()
    }
  }
  return { thinking: '', clean: content }
}

export const CARD_FIELD_LABELS = {
  name: 'Nombre',
  description: 'Descripción',
  personality: 'Personalidad',
  scenario: 'Escenario',
  first_mes: 'Primer mensaje',
  mes_example: 'Ejemplo de diálogo',
  creator_notes: 'Notas del creador',
  system_prompt: 'System Prompt',
  post_history_instructions: 'Instrucciones post-historial',
  alternate_greetings: 'Saludos alternativos',
  tags: 'Etiquetas',
  creator: 'Creador',
  character_version: 'Versión'
}
