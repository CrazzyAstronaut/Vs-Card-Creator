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
export function cardSizeInstruction(id) {
  const s = cardSizeById(id)
  return `OBJETIVO DE LONGITUD (${s.label}): la tarjeta resultante debe sumar aproximadamente ${s.range} tokens en total entre todos sus campos de texto (description, personality, scenario, first_mes, mes_example, etc.). Mantén un nivel de detalle ${s.detail}, ajustando la extensión de cada campo a ese presupuesto. No te excedas demasiado del rango indicado.`
}
