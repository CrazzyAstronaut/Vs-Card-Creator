import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json({ limit: '10mb' }))

// AI proxy endpoint — forwards requests to any OpenAI-compatible API
app.post('/api/ai/chat', async (req, res) => {
  const { apiKey, baseUrl, model, messages, temperature, maxTokens, stream } = req.body

  if (!apiKey || !baseUrl || !model) {
    return res.status(400).json({ error: 'Faltan campos requeridos: apiKey, baseUrl, model' })
  }

  const endpoint = baseUrl.replace(/\/$/, '') + '/chat/completions'

  try {
    const aiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.8,
        max_tokens: maxTokens ?? 8192,
        stream: stream ?? false
      })
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      return res.status(aiRes.status).json({ error: errText })
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      const reader = aiRes.body.getReader()
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(decoder.decode(value, { stream: true }))
        }
      } finally {
        res.end()
      }
    } else {
      const data = await aiRes.json()
      res.json(data)
    }
  } catch (err) {
    console.error('[AI Proxy Error]', err.message)
    res.status(500).json({ error: err.message || 'Error interno del servidor' })
  }
})

/**
 * Resolve the correct model-listing URL.
 *
 * NanoGPT expone tres endpoints (https://docs.nano-gpt.com/api-reference/endpoint/models):
 *   - /api/v1/models               → todos los modelos visibles (canónico)
 *   - /api/subscription/v1/models  → SOLO modelos incluidos en la suscripción
 *   - /api/paid/v1/models          → solo modelos de pago por uso
 *
 * La respuesta estándar NO trae un flag de suscripción por modelo, por eso para
 * filtrar "solo suscripción" se usa el endpoint dedicado de nanogpt.
 *
 * Para proveedores que no son nanogpt, el filtro de suscripción no aplica y se
 * usa el endpoint OpenAI estándar {baseUrl}/models.
 */
function resolveModelsUrl(baseUrl, subscriptionOnly) {
  const clean = (baseUrl || '').replace(/\/+$/, '')
  const isNano = /nano-?gpt\.com/i.test(clean)

  if (subscriptionOnly && isNano) {
    return { url: 'https://nano-gpt.com/api/subscription/v1/models', isNano, subscriptionApplied: true }
  }
  return { url: clean + '/models', isNano, subscriptionApplied: false }
}

// Lista de modelos (compatible OpenAI). Soporta el filtro "solo suscripción" de nanogpt.
app.post('/api/models', async (req, res) => {
  const { apiKey, baseUrl, subscriptionOnly } = req.body

  if (!apiKey || !baseUrl) {
    return res.status(400).json({ error: 'Faltan campos requeridos: apiKey, baseUrl' })
  }

  const { url, isNano, subscriptionApplied } = resolveModelsUrl(baseUrl, subscriptionOnly)

  try {
    const aiRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      return res.status(aiRes.status).json({ error: errText })
    }

    const data = await aiRes.json()
    // Formato OpenAI: { object: 'list', data: [{ id, ... }] }
    const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : [])
    const models = list
      .map(m => (typeof m === 'string' ? { id: m } : m))
      .filter(m => m && m.id)

    res.json({
      models,
      meta: {
        isNano,
        subscriptionApplied,
        subscriptionRequested: Boolean(subscriptionOnly),
        source: url
      }
    })
  } catch (err) {
    console.error('[Models Proxy Error]', err.message)
    res.status(500).json({ error: err.message || 'Error interno del servidor' })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`✦ V's Card Creator — servidor en http://localhost:${PORT}`)
})
