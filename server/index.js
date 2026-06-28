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
