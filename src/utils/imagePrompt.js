// Prompt e insumos compartidos para generar prompts de Stable Diffusion a partir
// de una tarjeta y una plantilla de preset de imagen.
export const SD_PROMPT = `Eres un experto creando prompts para Stable Diffusion en estilo Danbooru/booru (etiquetas en inglés separadas por comas).

Recibirás una PLANTILLA con marcadores entre < > y la información de un personaje. Tu tarea es sustituir ÚNICAMENTE los marcadores < > por etiquetas que describan ese aspecto del personaje.

Reglas estrictas:
- Mantén TODO lo demás de la plantilla EXACTAMENTE igual: LoRA (<lora:...>), tags de calidad, BREAK, pesos como (tag:1.4), comas, estructura y saltos de línea.
- NO traduzcas ni modifiques los <lora:...>; déjalos tal cual.
- Sustituye cada marcador por etiquetas booru concisas en inglés (ej: blue eyes, long hair, school uniform, big breasts, wide hips).
- Marcadores por zonas: "Upper" = cabeza/cara/pelo/ojos/expresión; "Medium" = torso/pecho/ropa superior; "Bottom" = cintura/caderas/ropa inferior/piernas. Si el marcador tiene otro nombre, infiere su significado.
- Usa pesos (tag:1.2-1.5) solo cuando aporte, como en el ejemplo.
- Devuelve ÚNICAMENTE el prompt final resultante. Sin explicaciones, sin comillas de código, sin texto adicional.`

export function buildSdUserContent(template, d = {}) {
  const charInfo = [
    `Nombre: ${d.name || '(sin nombre)'}`,
    d.description && `Descripción: ${d.description}`,
    d.personality && `Personalidad: ${d.personality}`,
    d.scenario && `Escenario: ${d.scenario}`,
    d.tags?.length && `Etiquetas: ${d.tags.join(', ')}`
  ].filter(Boolean).join('\n')
  return `PLANTILLA:\n${template}\n\nPERSONAJE:\n${charInfo}`
}
