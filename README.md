# ✦ V's Card Creator

Herramienta web para crear tarjetas de personaje para **SillyTavern** con asistencia de IA, compatible con el formato **Character Card Spec V2**.

![Dashboard](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20Express-8b5cf6?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)

---

## Características

- **Chat con IA** — Describe tu personaje y la IA genera la tarjeta completa en formato ST V2 (JSON listo para importar en SillyTavern)
- **Modo Co-work** — La IA hace preguntas guiadas para construir el personaje paso a paso (ideal para modelos de razonamiento)
- **Soporte thinking** — Muestra el razonamiento interno de modelos como DeepSeek R1, compatible con campos `reasoning_content` y etiquetas `<think>`
- **Sistema de presets** — Guarda, edita y selecciona prompts de sistema personalizados para distintos estilos de personajes
- **Dashboard** — Visualiza, busca, filtra y descarga todas tus tarjetas creadas
- **Importación** — Importa tarjetas ST existentes (JSON) mediante drag & drop o selector de archivo
- **Editor de campos** — Edita cualquier campo de la tarjeta directamente en la aplicación
- **Traducción ES ⇄ EN** — Botón rápido para traducir la tarjeta entre español e inglés con IA (reemplazar o guardar como copia)
- **Prompt de imagen (Stable Diffusion)** — Genera un prompt booru a partir de la tarjeta usando plantillas personalizables
- **Presets de imagen** — Crea y gestiona plantillas de prompt SD con marcadores que la IA rellena según el personaje
- **Universo compartido** — Crea personajes relacionados entre sí (familiares, rivales, mismo mundo) con modo automático o manual
- **Relaciones entre tarjetas** — Vincula personajes y deja que la IA ajuste una tarjeta para reflejar la relación, según el preset
- **Detalles de creación** — Cada tarjeta registra cómo se creó (modelo, distribuidor, preset, modo, temperature, universo)
- **Tarjetas multi-personaje** — Fusiona varias tarjetas en una sola con un narrador en tercera persona como `{{char}}`
- **API compatible con OpenAI** — Funciona con cualquier proveedor compatible: nano-gpt, OpenAI, OpenRouter, Ollama local, etc.
- **Carga dinámica de modelos** — Obtén la lista de modelos directamente desde la API, con un switch **"Solo suscripción"** que filtra a los modelos incluidos en la suscripción de nanogpt
- **Sin hardcodeo** — La API key se guarda en localStorage del navegador, nunca en el código ni en el servidor

---

## Sincronización entre dispositivos

Las tarjetas, presets, presets de imagen y ajustes (incluida la API key) se guardan **en el
servidor** (`data/store.json`, ignorado por git), además de en el navegador. Así se **comparten
automáticamente** entre todos los dispositivos que abran la app contra el mismo servidor (PC por
`localhost`, móvil por la IP de Tailscale, etc.).

- Al cargar, la app fusiona los datos del servidor con los locales (unión por id; no se pierde nada).
- Cada cambio se guarda en el servidor automáticamente.
- En **Configuración → Gestión de datos** tienes **"Copia de seguridad completa"** (exportar/importar
  todo en un `.json`) para migrar datos antiguos o respaldarlos.

> Como `localStorage` es independiente por dirección y por dispositivo, los datos creados antes de
> tener sincronización solo están en el navegador/dirección donde se crearon. Ábrelos ahí y se
> subirán al servidor (o usa la copia de seguridad completa para traerlos).

> Nota de seguridad: la API key se guarda en `data/store.json` en el servidor (no se sube a git).
> Es adecuado para un uso personal autoalojado en tu propia red de Tailscale.

## Inicio rápido (un solo clic)

En **Windows**, haz **doble clic en `Iniciar.bat`**. El script instala las dependencias la primera
vez, construye la app, la arranca en `http://localhost:3001` y **deja activo el acceso por
Tailscale**: muestra la URL por IP de Tailscale (`http://100.x.y.z:3001`) y activa `tailscale serve`
si es posible. Deja la ventana abierta; `Ctrl+C` detiene el servidor.

> El acceso por Tailscale requiere tener [Tailscale](https://tailscale.com/download) instalado y la
> sesión iniciada en este equipo y en el dispositivo desde el que quieras abrir la app.

## Requisitos

- **Node.js 18+** (incluye `fetch` nativo)
- Una API key de cualquier proveedor compatible con OpenAI Chat Completions

---

## Instalación

```bash
# 1. Clona el repositorio
git clone https://github.com/CrazzyAstronaut/Vs-Card-Creator.git
cd Vs-Card-Creator

# 2. Instala las dependencias
npm install

# 3. (Opcional) Copia el archivo de ejemplo de variables de entorno
cp .env.example .env
```

---

## Uso en desarrollo

```bash
npm run dev
```

Esto levanta dos servidores:
- **Frontend (Vite):** `http://localhost:5173`
- **Backend (Express):** `http://localhost:3001`

Abre `http://localhost:5173` en tu navegador.

---

## Uso en producción

```bash
# 1. Construye el frontend
npm run build

# 2. Inicia el servidor (sirve el frontend + API)
npm start
```

El servidor estará disponible en `http://localhost:3001` (o el puerto configurado en `.env`).

---

## Configuración de la API

1. Ve a **Configuración** en la barra lateral
2. Ingresa tu **API Key** del proveedor de IA
3. Ingresa la **Base URL** (endpoint compatible con OpenAI)
4. Selecciona o escribe el **modelo** que quieres usar
5. Haz clic en **"Probar conexión"** para verificar que todo funcione

### Lista de modelos y filtro "Solo suscripción"

En **Configuración → Conexión a la API** puedes pulsar **"↻ Cargar modelos desde la API"** para
obtener dinámicamente la lista de modelos disponibles de tu proveedor (endpoint OpenAI estándar
`{baseUrl}/models`).

El switch **"Solo suscripción"** (subscription-only) filtra la lista para mostrar únicamente los
modelos incluidos en la **suscripción de nanogpt** (no los de pago por uso):

- **Activado:** la app consulta el endpoint dedicado de nanogpt
  `https://nano-gpt.com/api/subscription/v1/models`, que según su
  [documentación oficial](https://docs.nano-gpt.com/api-reference/endpoint/models) *"siempre
  devuelve solo los modelos incluidos en la suscripción de NanoGPT"* (ignora la preferencia
  "Also show paid models" de la cuenta).
- **Desactivado:** se usa el endpoint canónico `{baseUrl}/models` con todos los modelos visibles.

**¿Cómo se determina la inclusión en la suscripción?** La respuesta estándar de modelos de nanogpt
**no** incluye un flag por modelo (`subscription: true/false`). Por eso el filtrado no se hace
inspeccionando cada modelo, sino consultando el endpoint dedicado que nanogpt mantiene curado:

| Endpoint | Devuelve |
|----------|----------|
| `/api/v1/models` | Todos los modelos visibles (respeta preferencias de la cuenta) |
| `/api/subscription/v1/models` | **Solo** modelos incluidos en la suscripción |
| `/api/paid/v1/models` | Solo modelos de pago por uso |

El switch solo está habilitado cuando el **Base URL** apunta a `nano-gpt.com`, ya que es una
característica específica de ese proveedor. Con otros proveedores el filtro se ignora y se muestra
la lista completa. La lógica de resolución del endpoint está en `server/index.js`
(`resolveModelsUrl`).

### Ejemplos de proveedores

| Proveedor | Base URL | Notas |
|-----------|----------|-------|
| [nano-gpt](https://nano-gpt.com) | `https://api.nano-gpt.com/v1` | Soporte DeepSeek R1, GPT-4o, etc. |
| [OpenAI](https://platform.openai.com) | `https://api.openai.com/v1` | GPT-4o, o1-preview, etc. |
| [OpenRouter](https://openrouter.ai) | `https://openrouter.ai/api/v1` | Acceso a cientos de modelos |
| [Ollama local](https://ollama.com) | `http://localhost:11434/v1` | Modelos locales gratuitos |

---

## Creación de tarjetas

### Modo Chat
1. Selecciona un **preset** (prompt de sistema)
2. Escribe la descripción del personaje en el chat
3. La IA genera la tarjeta en formato JSON
4. La tarjeta aparece en el panel derecho para revisión
5. Haz clic en **"Guardar tarjeta"** para añadirla al dashboard

### Modo Co-work
1. Selecciona el modo **Co-work** en el selector de modo
2. Haz clic en **"Iniciar Co-work"**
3. La IA te hará preguntas guiadas sobre tu personaje
4. Responde con tantos detalles como quieras
5. La IA generará la tarjeta automáticamente cuando tenga suficiente información
6. También puedes forzar la generación con el botón **"⚡ Generar ahora"**

---

## Tarjetas multi-personaje

Permite fusionar varios personajes en **una sola tarjeta** para roleplay grupal, con un **narrador en
tercera persona** como `{{char}}`.

**Flujo:**
1. En el dashboard pulsa **"Multi-personaje"** para entrar en modo de selección.
2. Marca las tarjetas que quieras fusionar (mínimo 2) y pulsa **"Crear multi-personaje"**.
3. Se abre un chat donde **introduces el objetivo del relato** (a qué quieres llegar con la historia).
4. La IA:
   - Sustituye los `{{char}}` de cada personaje por su **nombre** respectivo.
   - Crea un nuevo `{{char}}` como **narrador en tercera persona**.
   - Genera una tarjeta cuya `description` empieza con un bloque de instrucciones del narrador, luego
     un bloque con la trama (tu objetivo) y después una sección por personaje
     (*"The first of the girls is …"*).
5. Revisa la tarjeta, refínala por chat si quieres, y guárdala o descárgala como `.json`.

La tarjeta resultante queda relacionada con sus personajes miembros (y viceversa) y registra el modo
de creación `multi` en sus detalles.

## Universo compartido

Activa el switch **🌐 Universo** en la barra de creación para que la IA pueda leer y relacionar el
nuevo personaje con los que ya tienes guardados. Tiene dos modos:

- **Auto** — La IA recibe un *roster* de todos tus personajes y, si mencionas a alguno por su nombre
  (ej: *"Quiero hacer a la hermana de Elara, parecida en apariencia pero su personalidad es…"*), lee
  los datos reales de **Elara**, reutiliza sus rasgos físicos y mantiene la coherencia del mundo.
- **Manual** — Pulsa **"Tarjetas (n)"** y selecciona explícitamente con qué personajes podría
  relacionarse. La IA recibirá los datos completos de esas tarjetas.

Al guardar, el personaje queda **vinculado** (relación bidireccional) con los personajes usados como
referencia, y esas relaciones aparecen en la vista de la tarjeta.

## Relaciones entre tarjetas

En la vista de una tarjeta, la sección **🌐 Relaciones de universo** permite **añadir o quitar
vínculos** con otros personajes (hermana, rival, pareja, mismo mundo…). Al añadir una relación puedes
activar **"Ajustar esta tarjeta con IA"**: la IA modifica ligeramente el personaje para reflejar el
vínculo de forma coherente, usando el **preset** que elijas (introduce guiños, coherencia de mundo y
matices sin reescribirlo todo). Las relaciones son bidireccionales y no se incluyen en el `.json`
exportado (son metadatos de la app).

## Detalles de creación

Cada tarjeta guarda y muestra **cómo se creó** en la sección **🛠️ Detalles de creación**:
distribuidor (proveedor de la API), modelo, modo (Chat / Co-work / Traducción / Importada), preset
usado, temperature, si se usó universo compartido (manual/automático) y las fechas de creación y
edición.

## Acciones de IA sobre la tarjeta lista

En la vista de una tarjeta (al abrirla desde el dashboard) hay tres botones rápidos. Además, cada
tarjeta del dashboard tiene accesos directos (✏️ y 🎨) que abren la tarjeta directamente en el
modo correspondiente.

### ✏️ Editar con IA
Despliega un panel de chat a la derecha (igual que el asistente de presets) donde pides cambios en
lenguaje natural — por ejemplo *"hazla más tímida"*, *"añade un trasfondo trágico"* o *"cambia el
escenario a una cafetería"*. La IA responde de forma conversacional, **actualiza la tarjeta y la
guarda automáticamente**, y los campos modificados parpadean en la columna izquierda. Muestra
animación de skeleton mientras genera.

### 🌐 Traducir (ES ⇄ EN)
Traduce los campos de texto de la tarjeta (descripción, personalidad, escenario, mensajes, saludos
alternativos, etc.) entre español e inglés, conservando los marcadores `{{user}}` / `{{char}}`, el
formato y los nombres propios. Tras generar la traducción puedes **reemplazar la tarjeta actual** o
**guardar una copia traducida** (con sufijo `(EN)` / `(ES)`).

### 🎨 Prompt de imagen (Stable Diffusion)
Genera un prompt en estilo Danbooru/booru listo para pegar en Stable Diffusion, a partir de una
**plantilla de imagen** que puedes elegir y editar al vuelo. La IA sustituye los marcadores `<...>`
por etiquetas que describen al personaje, manteniendo intacto el resto (LoRA, tags de calidad,
`BREAK`, pesos como `(tag:1.4)`).

## Presets de imagen

En la sección **Presets Imagen** del menú lateral puedes crear, editar, duplicar y eliminar
plantillas de prompt para Stable Diffusion. Una plantilla usa marcadores entre `<corchetes angulares>`
que la IA rellena según el personaje. Ejemplo (incluido por defecto):

```
<lora:ratatatat74:1>, MATURE FEMALE, (masterpiece), (best quality), (ultra-detailed), amazing quality, very aesthetic, illustration, perfect composition, intricate details, realistic, 1girl, simple background, black background, cowboy-shot, BREAK,
looking at viewer, <Upper Description>, BREAK,
<Medium Description>, BREAK,
<Bottom Description>
```

Resultado generado por la IA (ejemplo):

```
<lora:ratatatat74:1>, MATURE FEMALE, (masterpiece), (best quality), (ultra-detailed), amazing quality, very aesthetic, illustration, perfect composition, intricate details, realistic, 1girl, simple background, black background, cowboy-shot, BREAK,
looking at viewer, blue eyes, gray hair, long hair, bangs, BREAK,
(big breasts:1.4), school shirt, white shirt, bare stomach, red tie, BREAK,
small waist, (wide hips:1.5), short skirt, scholar skirt, Japanese School Uniforms
```

Los marcadores por zonas se interpretan así: **Upper** = cabeza/cara/pelo/ojos/expresión ·
**Medium** = torso/pecho/ropa superior · **Bottom** = cintura/caderas/ropa inferior. Para otros
nombres de marcador, la IA infiere el significado.

## Formato de salida (ST Character Card V2)

Las tarjetas se exportan como archivos `.json` con la siguiente estructura:

```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "Nombre del personaje",
    "description": "Descripción detallada...",
    "personality": "Rasgos de personalidad...",
    "scenario": "Escenario inicial...",
    "first_mes": "Primer mensaje del personaje...",
    "mes_example": "<START>\n{{user}}: ...\n{{char}}: ...",
    "creator_notes": "Notas del creador...",
    "system_prompt": "",
    "post_history_instructions": "",
    "alternate_greetings": ["Saludo alternativo 1", "..."],
    "tags": ["tag1", "tag2"],
    "creator": "Tu nombre",
    "character_version": "1.0",
    "extensions": {}
  }
}
```

Para importar en SillyTavern: Panel de personajes → Importar → selecciona el archivo `.json`.

---

## Presets

Los presets son prompts de sistema que guían a la IA en la creación de tarjetas. La aplicación incluye 4 presets predeterminados:

- **Creación Estándar** — Tarjetas detalladas y completas
- **Co-work Colaborativo** — Para el modo de preguntas guiadas
- **Personaje Anime/Manga** — Especializado en tropos del género
- **Personaje RPG/Fantasía** — Ideal para NPCs y personajes de mundo fantástico

Puedes crear, editar, duplicar y eliminar tus propios presets desde la sección **Presets**.

### Crear presets con IA

Al crear un nuevo preset (o editar uno existente), pulsa el botón **"✨ Crear con IA"** en la
cabecera del editor. Se despliega un panel de chat a la derecha donde puedes describir libremente
qué tipo de preset quieres. La IA:

- Responde de forma conversacional en cada mensaje (una respuesta por turno)
- Rellena automáticamente los campos **Nombre**, **Descripción** y **System Prompt** en la vista
  previa de la izquierda
- Compara el estado actual de los campos con lo que pides para ir ajustándolo en cada turno
- Muestra una **animación de skeleton** mientras genera la respuesta

Puedes seguir conversando para refinar el preset y, cuando estés conforme, pulsar **"Crear preset"**.

---

## Estructura del proyecto

```
Vs-Card-Creator/
├── src/                    # Frontend (React + Vite)
│   ├── components/
│   │   ├── Dashboard.jsx   # Panel principal de tarjetas
│   │   ├── ChatCreate.jsx  # Interfaz de creación con IA (+ universo compartido)
│   │   ├── MultiCharacterCreate.jsx # Fusión de varias tarjetas en una
│   │   ├── CardPreview.jsx # Vista y editor de tarjeta
│   │   ├── PresetManager.jsx # Gestión de presets de texto (+ asistente IA)
│   │   ├── ImagePresetManager.jsx # Gestión de presets de imagen (SD)
│   │   ├── Settings.jsx    # Configuración
│   │   └── Sidebar.jsx     # Navegación lateral
│   ├── hooks/
│   │   └── useLocalStorage.js
│   ├── utils/
│   │   ├── cardSchema.js   # Utilidades del formato ST + helpers IA
│   │   ├── aiClient.js     # Cliente de streaming para la API de IA
│   │   ├── defaultPresets.js
│   │   └── defaultImagePresets.js
│   └── App.jsx
├── server/
│   └── index.js            # Express API proxy (evita CORS)
├── .env.example
├── .gitignore
└── package.json
```

---

## Seguridad

- La **API key nunca se hardcodea** ni se sube al repositorio
- El servidor Express actúa como proxy para evitar exponer la API key directamente al navegador en peticiones cross-origin
- Los datos (tarjetas, presets, configuración) se guardan únicamente en el **localStorage** de tu navegador
- El archivo `.env` está en `.gitignore` para evitar subidas accidentales

---

## Stack técnico

- **Frontend:** React 18, React Router v6, Vite 5
- **Backend:** Node.js, Express 4
- **Estilos:** CSS custom properties (sin frameworks)
- **Almacenamiento:** localStorage (cliente)
- **Comunicación IA:** OpenAI-compatible Chat Completions con streaming SSE

---

## Licencia

MIT — úsalo libremente para crear tus personajes ✦
