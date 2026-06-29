import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { extractCardFromText, cardToStorageItem, parseThinkingContent, downloadCard, buildCharacterProfile, providerFromBaseUrl } from '../utils/cardSchema.js'
import { streamChat } from '../utils/aiClient.js'
import { playPing } from '../utils/sound.js'

const MULTI_SYSTEM = `Eres un experto en crear tarjetas "multi-personaje" (group roleplay) para SillyTavern (formato chara_card_v2).

Vas a FUSIONAR varios personajes en UNA sola tarjeta cuyo {{char}} es un NARRADOR en tercera persona que describe las interacciones entre todos los personajes y {{user}}.

REGLAS DE CONSTRUCCIÓN:
1. El {{char}} de la tarjeta resultante es el NARRADOR (tercera persona). NUNCA uses {{char}} para referirte a los personajes individuales: a ellos llámalos por su NOMBRE.
2. Conserva {{user}} (segunda persona) para el usuario. El narrador nunca habla ni piensa por {{user}}.
3. El campo "description" DEBE seguir EXACTAMENTE esta estructura (sigue el estilo de este ejemplo, adaptando nombres y trama):

[(You are a narrator who describes the interactions and actions between the party members throughout the roleplay. Never speak or think for {{user}}. Refer to {{user}} in the second person. Narrate each interaction and action from <LISTA DE NOMBRES> with {{user}}. Every character will interact with {{user}} in different ways according to their personalities. {{user}} is the only one able to start any sort of sexual activity or finish it.)]

[(The main plot of this roleplay is <OBJETIVO DEL USUARIO>. <LISTA DE NOMBRES> will initially ... As {{user}} progresses ... )]

[The first of the girls is <Nombre1>. <descripción y personalidad de Nombre1, usando su nombre en vez de {{char}}>]
[The second is <Nombre2>. <...>]
... (una entrada por cada personaje)

4. first_mes: una apertura NARRADA en tercera persona que presente la escena grupal e invite a {{user}} a actuar.
5. personality: describe brevemente al narrador y a cada personaje por su nombre.
6. scenario: el escenario común basado en el objetivo.
7. mes_example: ejemplos con formato <START> mostrando al narrador describiendo a varios personajes interactuando con {{user}}.
8. tags: combina las etiquetas relevantes de los personajes + "multi-character" y "group".
9. IDIOMA: escribe los bloques del narrador y la trama en el MISMO idioma que use el usuario para su objetivo; si el ejemplo/los personajes están en inglés, mantén el inglés. Respeta el tono y contenido original de cada personaje.

Recibirás el OBJETIVO del relato y los PERFILES de cada personaje (ya con {{char}} sustituido por su nombre).

Conversa con el usuario para refinar si hace falta. Cuando generes la tarjeta final, entrégala dentro de un bloque \`\`\`json con un objeto chara_card_v2 completo (spec, spec_version y data con todos los campos).`

function autoResize(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

export default function MultiCharacterCreate({ cards, setCards, settings }) {
  const navigate = useNavigate()
  const location = useLocation()
  const navIds = location.state?.ids
  // Borrador previo (auto-guardado) por si se volvió sin estado de navegación
  const [restored] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vcc_draft_multi') || 'null') } catch { return null }
  })
  const fresh = Boolean(navIds)
  const ids = navIds || restored?.ids || []
  const selected = cards.filter(c => ids.includes(c._id))

  const [messages, setMessages] = useState(() => fresh ? [] : (restored?.messages || []))
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentCard, setCurrentCard] = useState(() => fresh ? null : (restored?.currentCard || null))
  const [previewTab, setPreviewTab] = useState('fields')
  const [thinkingOpen, setThinkingOpen] = useState({})
  const [saved, setSaved] = useState(false)
  const [toasts, setToasts] = useState([])
  const endRef = useRef(null)
  const abortRef = useRef(null)

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Auto-guardado del borrador de la conversación multi-personaje
  useEffect(() => {
    try {
      if (messages.length || currentCard) {
        localStorage.setItem('vcc_draft_multi', JSON.stringify({ ids, messages, currentCard }))
      } else {
        localStorage.removeItem('vcc_draft_multi')
      }
    } catch {}
  }, [messages, currentCard, ids])

  const profiles = selected.map(buildCharacterProfile).join('\n\n')
  const names = selected.map(c => c.data?.name || 'Personaje')

  const sendMessage = async (userText) => {
    if (!userText.trim() || isLoading) return
    if (!settings.apiKey) { addToast('Configura tu API key en Configuración', 'error'); return }

    const userMsg = { id: Date.now(), role: 'user', content: userText.trim() }
    const aiId = Date.now() + 1
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMsg, { id: aiId, role: 'assistant', content: '', thinkingContent: '', isStreaming: true }])
    setInput('')
    setIsLoading(true)
    setSaved(false)

    const apiMessages = [
      { role: 'system', content: MULTI_SYSTEM },
      { role: 'system', content: `PERSONAJES A FUSIONAR (${names.length}): ${names.join(', ')}\n\nPERFILES (con {{char}} ya sustituido por el nombre de cada uno):\n\n${profiles}` },
      ...history,
      { role: 'user', content: userText.trim() }
    ]

    try {
      const controller = new AbortController()
      abortRef.current = controller
      let think = ''

      const full = await streamChat({
        settings,
        signal: controller.signal,
        messages: apiMessages,
        maxTokens: Math.max(settings.maxTokens ?? 8192, 12000),
        onDelta: (acc) => {
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: acc } : m))
        }
      })

      const parsedThink = parseThinkingContent(full)
      const finalContent = parsedThink.thinking ? parsedThink.clean : full
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: finalContent, thinkingContent: parsedThink.thinking || think, isStreaming: false } : m))
      if (settings.soundEnabled !== false) playPing()

      const card = extractCardFromText(finalContent)
      if (card) {
        if (settings.creatorName) card.data.creator = settings.creatorName
        if (!Array.isArray(card.data.tags)) card.data.tags = []
        if (!card.data.tags.includes('multi-character')) card.data.tags.push('multi-character')
        setCurrentCard(card)
        addToast('¡Tarjeta multi-personaje generada! Revísala a la derecha.', 'success')
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: '[Generación cancelada]', isStreaming: false } : m))
      } else {
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: `Error: ${err.message}`, isStreaming: false, isError: true } : m))
        addToast(`Error: ${err.message}`, 'error')
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }

  const saveCard = () => {
    if (!currentCard) return
    const item = cardToStorageItem(currentCard, {
      mode: 'multi',
      model: settings.model,
      provider: providerFromBaseUrl(settings.baseUrl),
      baseUrl: settings.baseUrl,
      temperature: settings.temperature,
      relations: selected.map(c => ({ targetId: c._id, name: c.data?.name || 'Personaje', type: 'miembro', note: 'Miembro de la tarjeta multi-personaje' }))
    })
    setCards(prev => {
      const withInverse = prev.map(c =>
        ids.includes(c._id)
          ? { ...c, _relations: [...(c._relations || []).filter(r => r.targetId !== item._id), { targetId: item._id, name: item.data?.name || 'Grupo', type: 'grupo', note: 'Aparece en una tarjeta multi-personaje' }] }
          : c
      )
      return [item, ...withInverse]
    })
    setSaved(true)
    addToast(`"${currentCard.data?.name || 'Multi-personaje'}" guardada`, 'success')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  if (selected.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">👥</div>
        <div className="empty-state-title">Sin personajes seleccionados</div>
        <p className="empty-state-desc">Vuelve al dashboard, activa el modo de selección y elige al menos 2 tarjetas para fusionarlas.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Ir al dashboard</button>
      </div>
    )
  }

  return (
    <div className="chat-create">
      {/* Toolbar */}
      <div className="chat-toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Volver</button>
        <span className="chat-toolbar-title">👥 Multi-personaje</span>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {names.map((n, i) => <span key={i} className="tag tag-purple">{n}</span>)}
        </div>
        <div style={{ flex: 1 }} />
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setMessages([]); setCurrentCard(null); setSaved(false) }}>Limpiar</button>
        )}
        {isLoading && abortRef.current && (
          <button className="btn btn-danger btn-sm" onClick={() => abortRef.current?.abort()}>◼ Detener</button>
        )}
      </div>

      <div className="chat-body">
        {/* Chat panel */}
        <div className="chat-panel">
          <div className="messages-list">
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', textAlign: 'center', color: 'var(--text-4)', padding: '40px' }}>
                <div style={{ fontSize: '64px', opacity: 0.3 }}>👥</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-3)' }}>Fusionar {names.length} personajes</div>
                <div style={{ fontSize: '13px', maxWidth: '380px', lineHeight: 1.7 }}>
                  Describe el <strong>objetivo del relato</strong> (a qué quieres llegar con la historia grupal). La IA creará una sola tarjeta con un narrador en tercera persona ({'{{char}}'}) y sustituirá los {'{{char}}'} de cada personaje por su nombre.
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-4)' }}>
                  Ej: "La trama es la corrupción de las chicas de la empresa; al inicio son distantes con {'{{user}}'}..."
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`message ${msg.role} ${msg.isError ? 'error' : ''}`}>
                <div className="message-role">{msg.role === 'user' ? 'Tú' : 'IA'}</div>
                {msg.thinkingContent && (
                  <div className="message-thinking">
                    <div className="thinking-header" onClick={() => setThinkingOpen(p => ({ ...p, [msg.id]: !p[msg.id] }))}>
                      <span className="thinking-icon" style={{ animation: msg.isStreaming ? 'spin 2s linear infinite' : 'none' }}>⟳</span>
                      <span>Razonamiento interno</span>
                      <span style={{ marginLeft: 'auto' }}>{thinkingOpen[msg.id] ? '▲' : '▼'}</span>
                    </div>
                    {thinkingOpen[msg.id] && <div className="thinking-body">{msg.thinkingContent}</div>}
                  </div>
                )}
                {msg.role === 'assistant' && msg.isStreaming && !msg.content ? (
                  <div className="skeleton-bubble">
                    <span className="skeleton skeleton-line skeleton-w-90" />
                    <span className="skeleton skeleton-line skeleton-w-100" />
                    <span className="skeleton skeleton-line skeleton-w-70" />
                  </div>
                ) : (
                  <div className="message-bubble">
                    {msg.content}
                    {msg.isStreaming && <span style={{ opacity: 0.5 }}>▋</span>}
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="chat-input-area">
            <div className="chat-input-row">
              <textarea
                className="chat-textarea"
                placeholder="Describe el objetivo del relato grupal..."
                value={input}
                onChange={e => { setInput(e.target.value); autoResize(e.target) }}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isLoading}
              />
              <button className="chat-send-btn" onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()} title="Enviar (Enter)">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>
              Enter para enviar · {names.length} personajes · Modelo: <strong>{settings.model || 'no configurado'}</strong>
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <div className="preview-panel">
          <div className="preview-header">
            <span className="preview-title">Vista previa</span>
            {currentCard && (
              <div className="preview-tabs">
                <button className={`preview-tab ${previewTab === 'fields' ? 'active' : ''}`} onClick={() => setPreviewTab('fields')}>Campos</button>
                <button className={`preview-tab ${previewTab === 'json' ? 'active' : ''}`} onClick={() => setPreviewTab('json')}>JSON</button>
              </div>
            )}
          </div>

          <div className="preview-content">
            {!currentCard ? (
              <div className="preview-empty">
                <div className="preview-empty-icon">📋</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-3)' }}>Sin tarjeta aún</div>
                <div style={{ fontSize: '12px', lineHeight: 1.6 }}>La tarjeta multi-personaje aparecerá aquí</div>
              </div>
            ) : previewTab === 'fields' ? (
              <MultiFields card={currentCard} />
            ) : (
              <div className="json-viewer">{JSON.stringify(currentCard, null, 2)}</div>
            )}
          </div>

          {currentCard && (
            <div className="preview-actions">
              {!saved ? (
                <button className="btn btn-primary w-full" onClick={saveCard}>Guardar tarjeta</button>
              ) : (
                <button className="btn btn-success w-full" onClick={() => navigate('/')}>✓ Guardada — Ver dashboard</button>
              )}
              <button className="btn btn-secondary btn-sm w-full" onClick={() => downloadCard({ ...currentCard, _id: '', _createdAt: '', _updatedAt: '', _meta: {}, _relations: [] })}>
                Descargar .json
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'} {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

function MultiFields({ card }) {
  const d = card.data
  const fields = [
    ['description', 'Descripción'],
    ['personality', 'Personalidad'],
    ['scenario', 'Escenario'],
    ['first_mes', 'Primer mensaje'],
    ['mes_example', 'Ejemplo de diálogo']
  ]
  return (
    <div className="card-fields">
      {d.name && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-3)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, var(--accent-1), var(--accent-3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#fff' }}>👥</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)' }}>{d.name}</div>
        </div>
      )}
      {fields.filter(([k]) => d[k]).map(([k, label]) => (
        <div key={k} className="card-field">
          <div className="card-field-label">{label}</div>
          <div className="card-field-value">{d[k]}</div>
        </div>
      ))}
      {Array.isArray(d.tags) && d.tags.length > 0 && (
        <div className="card-field">
          <div className="card-field-label">Etiquetas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {d.tags.map(t => <span key={t} className="tag tag-purple">{t}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}
