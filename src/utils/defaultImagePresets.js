// Presets de plantillas para prompts de Stable Diffusion.
// Los marcadores entre < > son los que la IA rellena según el personaje.
export const DEFAULT_IMAGE_PRESETS = [
  {
    id: 'imgpreset-ratatatat',
    name: 'Ratatatat74 — Anime mujer (cowboy shot)',
    description: 'Estructura por zonas: superior (cara/pelo), media (torso/ropa) e inferior (cintura/falda). LoRA ratatatat74.',
    isDefault: true,
    createdAt: new Date(0).toISOString(),
    template: `<lora:ratatatat74:1>, MATURE FEMALE, (masterpiece), (best quality), (ultra-detailed), amazing quality, very aesthetic, illustration, perfect composition, intricate details, realistic, 1girl, simple background, black background, cowboy-shot, BREAK,
looking at viewer, <Upper Description>, BREAK,
<Medium Description>, BREAK,
<Bottom Description>`
  },
  {
    id: 'imgpreset-anime-portrait',
    name: 'Anime — Retrato (busto)',
    description: 'Retrato simple centrado en cara y expresión, estilo anime de alta calidad.',
    isDefault: true,
    createdAt: new Date(0).toISOString(),
    template: `(masterpiece), (best quality), (ultra-detailed), very aesthetic, illustration, 1girl, upper body, looking at viewer, soft lighting, simple background, BREAK,
<Face and Hair>, BREAK,
<Expression and Eyes>, BREAK,
<Outfit (top)>`
  },
  {
    id: 'imgpreset-realistic-full',
    name: 'Realista — Cuerpo completo',
    description: 'Render fotorrealista de cuerpo completo con descripción libre por zonas.',
    isDefault: true,
    createdAt: new Date(0).toISOString(),
    template: `(photorealistic:1.2), (best quality), (ultra-detailed), 8k, sharp focus, full body, natural lighting, BREAK,
<Appearance: face, hair, eyes, skin>, BREAK,
<Clothing and accessories>, BREAK,
<Body type and pose>, BREAK,
<Background and setting>`
  }
]
