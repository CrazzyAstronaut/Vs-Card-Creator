export const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.nano-gpt.com/v1',
  model: 'deepseek/deepseek-r1',
  temperature: 0.8,
  maxTokens: 8192,
  creatorName: '',
  streamingEnabled: true,
  subscriptionOnly: false
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
      mode: meta.mode || 'chat'
    },
    ...card
  }
}

export function downloadCard(card) {
  // Strip internal metadata fields before export
  const { _id, _createdAt, _updatedAt, _meta, ...exportCard } = card
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
