// Tamaños de tarjeta (presupuesto de tokens del contenido permanente).
// "tokens" es el límite de generación que se envía a la API (con margen para el JSON).
export const CARD_SIZES = [
  { id: 'lite',   label: 'Lite',   range: '300-500',   detail: 'muy conciso, esencial',           maxTokens: 1500 },
  { id: 'small',  label: 'Small',  range: '500-600',   detail: 'breve pero completo',             maxTokens: 1800 },
  { id: 'medium', label: 'Medium', range: '600-700',   detail: 'equilibrado',                     maxTokens: 2200 },
  { id: 'high',   label: 'High',   range: '700-900',   detail: 'detallado',                       maxTokens: 2800 },
  { id: 'extra',  label: 'Extra',  range: '900-1200',  detail: 'muy detallado',                   maxTokens: 3600 },
  { id: 'max',    label: 'Max',    range: '1200-2000', detail: 'extenso y rico',                  maxTokens: 5200 },
  { id: 'ultra',  label: 'Ultra',  range: '+2000',     detail: 'exhaustivo, máximo desarrollo',   maxTokens: 8192 }
]

export function cardSizeById(id) {
  return CARD_SIZES.find(s => s.id === id) || CARD_SIZES[2]
}

export function cardSizeIndex(id) {
  const i = CARD_SIZES.findIndex(s => s.id === id)
  return i === -1 ? 2 : i
}

// Instrucción de longitud que se inyecta al sistema para guiar a la IA.
// IMPORTANTE: el presupuesto se refiere a TOKENS PERMANENTES (los que siempre
// están en el contexto), NO a first_mes, mes_example ni alternate_greetings.
export function cardSizeInstruction(id) {
  const s = cardSizeById(id)
  return `OBJETIVO DE LONGITUD (${s.label}): aproximadamente ${s.range} TOKENS PERMANENTES. Solo cuentan los campos que permanecen siempre en el contexto: "description", "personality", "scenario", "system_prompt" y "post_history_instructions". NO se cuentan "first_mes", "mes_example" ni "alternate_greetings" (esos pueden tener la longitud que necesiten para ser naturales). Mantén un nivel de detalle ${s.detail} en los campos permanentes, ajustando su extensión a ese presupuesto sin excederte demasiado del rango.`
}
