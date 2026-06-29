import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractCardFromText, cardToStorageItem, parseThinkingContent, downloadCard, providerFromBaseUrl, summarizeCardForContext, buildRosterSummary, detectMentionedCards } from '../utils/cardSchema.js'
import { playPing } from '../utils/sound.js'

const COWORK_STEPS = ['Concepto', 'Personalidad', 'Apariencia', 'Historia', 'Escenario', 'Voz', 'Generando']

function autoResize(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

export default function ChatCreate({ settings, presets, cards, setCards }) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentCard, setCurrentCard] = useState(null)
  const [previewTab, setPreviewTab] = useState('fields')
  const [mode, setMode] = useState('chat')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [coworkStep, setCoworkStep] = useState(0)
  const [thinkingOpen, setThinkingOpen] = useState({})
  const [toasts, setToasts] = useState([])
  const [saved, setSaved] = useState(false)
  // Shared universe
  const [sharedUniverse, setSharedUniverse] = useState(false)
  const [suMode, setSuMode] = useState('auto') // 'auto' | 'manual'
  const [selectedRelatedIds, setSelectedRelatedIds] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [usedRelationIds, setUsedRelationIds] = useState([]) // ids realmente usados como contexto
  const textareaRef = useRef(null)
  const messagesEndRef = useRef(null)
  const abortRef = useRef(null)

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }

  // Get preset list filtered by mode
  const availablePresets = presets.filter(p => !mode || p.mode === mode || p.mode === 'chat')

  // Sync preset when mode changes
  useEffect(() => {
    const modePresets = presets.filter(p => p.mode === mode)
    if (modePresets.length > 0) setSelectedPresetId(modePresets[0].id)
    else if (presets.length > 0) setSelectedPresetId(presets[0].id)
  }, [mode, presets])

  const selectedPreset = presets.find(p => p.id === selectedPresetId) || presets[0]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Restaurar borrador de conversación al entrar (auto-guardado)
  const draftLoaded = useRef(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('vcc_draft_chat')
      if (raw) {
        const d = JSON.parse(raw)
        if (Array.isArray(d.messages) && d.messages.length) setMessages(d.messages)
        if (d.currentCard) { setCurrentCard(d.currentCard); setCoworkStep(COWORK_STEPS.length - 1) }
        if (d.mode) setMode(d.mode)
      }
    } catch {}
    draftLoaded.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Guardar borrador en cada cambio (queda sin confirmar hasta Guardar/Descartar)
  useEffect(() => {
    if (!draftLoaded.current) return
    try {
      if (messages.length || currentCard) {
        localStorage.setItem('vcc_draft_chat', JSON.stringify({ messages, currentCard, mode }))
      } else {
        localStorage.removeItem('vcc_draft_chat')
      }
    } catch {}
  }, [messages, currentCard, mode])

  const buildApiMessages = useCallback((msgs, systemPrompt, extraSystems = []) => {
    const apiMsgs = []
    if (systemPrompt) apiMsgs.push({ role: 'system', content: systemPrompt })
    extraSystems.forEach(s => { if (s) apiMsgs.push({ role: 'system', content: s }) })
    msgs.forEach(m => {
      if (m.role === 'user' || m.role === 'assistant') {
        apiMsgs.push({ role: m.role, content: m.content || '' })
      }
    })
    return apiMsgs
  }, [])

  // Construye el contexto de "Universo compartido" para inyectarlo a la IA.
  const buildUniverseContext = useCallback((userText) => {
    if (!sharedUniverse) return { sys: null, ids: [] }
    let related = []
    if (suMode === 'manual') {
      related = cards.filter(c => selectedRelatedIds.includes(c._id))
    } else {
      const convoText = [...messages.map(m => m.content || ''), userText].join('\n')
      related = detectMentionedCards(convoText, cards)
    }
    const ids = related.map(c => c._id)
    const detailBlocks = related.map(summarizeCardForContext).join('\n\n')

    let sys = '[MODO UNIVERSO COMPARTIDO ACTIVADO]\n'
    if (suMode === 'auto') {
      sys += 'Personajes existentes en este universo (roster). Si el usuario menciona a alguno, usa SUS datos reales para mantener coherencia:\n'
      sys += buildRosterSummary(cards) + '\n'
    }
    if (detailBlocks) {
      sys += '\nDatos COMPLETOS de los personajes relacionados con los que debes mantener coherencia:\n' + detailBlocks + '\n'
    }
    sys += '\nCuando el nuevo personaje tenga relación con alguno (familiar, pareja, rival, amigo, mismo mundo, apariencia parecida, etc.), respeta y referencia sus datos reales. Si se pide "parecido/a en apariencia", reutiliza rasgos físicos concretos del personaje indicado.'
    return { sys, ids }
  }, [sharedUniverse, suMode, cards, selectedRelatedIds, messages])

  const sendMessage = useCallback(async (userText) => {
    if (!userText.trim() || isLoading) return
    if (!settings.apiKey) { addToast('Configura tu API key en Configuración', 'error'); return }

    const userMsg = { id: Date.now(), role: 'user', content: userText.trim() }
    const aiMsgId = Date.now() + 1

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    setSaved(false)

    const aiMsg = { id: aiMsgId, role: 'assistant', content: '', thinkingContent: '', isStreaming: true }
    setMessages(prev => [...prev, aiMsg])

    const systemPrompt = selectedPreset?.systemPrompt || ''
    const allMsgs = [...messages, userMsg]
    const { sys: universeSys, ids: relIds } = buildUniverseContext(userText)
    if (relIds.length) setUsedRelationIds(prev => Array.from(new Set([...prev, ...relIds])))
    const apiMessages = buildApiMessages(allMsgs, systemPrompt, universeSys ? [universeSys] : [])

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: settings.model,
          messages: apiMessages,
          temperature: settings.temperature ?? 0.8,
          maxTokens: settings.maxTokens ?? 8192,
          stream: true
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `Error ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let thinkContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.reasoning_content) thinkContent += delta.reasoning_content
            if (delta?.content) fullContent += delta.content
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, content: fullContent, thinkingContent: thinkContent } : m
            ))
          } catch {}
        }
      }

      // Parse <think> tags (some models like DeepSeek R1 use this format)
      const parsed = parseThinkingContent(fullContent)
      const finalContent = parsed.thinking ? parsed.clean : fullContent
      const finalThinking = parsed.thinking || thinkContent

      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, content: finalContent, thinkingContent: finalThinking, isStreaming: false }
          : m
      ))
      if (settings.soundEnabled !== false) playPing()

      // Try to extract card
      const card = extractCardFromText(finalContent)
      if (card) {
        if (settings.creatorName) card.data.creator = settings.creatorName
        setCurrentCard(card)
        setCoworkStep(COWORK_STEPS.length - 1)
        addToast('¡Tarjeta detectada! Revísala en el panel derecho.', 'success')
      } else if (mode === 'cowork') {
        setCoworkStep(prev => Math.min(prev + 1, COWORK_STEPS.length - 2))
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, content: '[Generación cancelada]', isStreaming: false } : m
        ))
      } else {
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, content: `Error: ${err.message}`, isStreaming: false, isError: true } : m
        ))
        addToast(`Error: ${err.message}`, 'error')
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [isLoading, settings, selectedPreset, messages, mode, buildApiMessages, buildUniverseContext])

  // Start co-work with AI greeting
  const startCowork = useCallback(async () => {
    if (!settings.apiKey) { addToast('Configura tu API key en Configuración', 'error'); return }
    setMessages([])
    setCurrentCard(null)
    setCoworkStep(0)
    setSaved(false)
    setIsLoading(true)

    const aiMsgId = Date.now()
    setMessages([{ id: aiMsgId, role: 'assistant', content: '', thinkingContent: '', isStreaming: true }])

    const systemPrompt = selectedPreset?.systemPrompt || ''
    const initPrompt = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Iniciamos el proceso de co-creación. Preséntate brevemente y hazme la primera pregunta para comenzar a diseñar mi personaje.' }
    ]

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: settings.model,
          messages: initPrompt,
          temperature: settings.temperature ?? 0.8,
          maxTokens: settings.maxTokens ?? 4096,
          stream: true
        })
      })

      if (!res.ok) throw new Error(`Error ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta
            if (delta?.content) {
              fullContent += delta.content
              setMessages([{ id: aiMsgId, role: 'assistant', content: fullContent, thinkingContent: '', isStreaming: true }])
            }
          } catch {}
        }
      }

      setMessages([{ id: aiMsgId, role: 'assistant', content: fullContent, thinkingContent: '', isStreaming: false }])
    } catch (err) {
      addToast(`Error al iniciar co-work: ${err.message}`, 'error')
      setMessages([])
    } finally {
      setIsLoading(false)
    }
  }, [settings, selectedPreset])

  const handleModeChange = (newMode) => {
    setMode(newMode)
    setMessages([])
    setCurrentCard(null)
    setCoworkStep(0)
    setSaved(false)
  }

  const saveCard = () => {
    if (!currentCard) return
    const relIds = sharedUniverse
      ? (suMode === 'manual' ? selectedRelatedIds : usedRelationIds).filter(Boolean)
      : []
    const relations = relIds.map(rid => {
      const c = cards.find(x => x._id === rid)
      return { targetId: rid, name: c?.data?.name || 'Personaje', type: 'universo', note: '' }
    })

    const item = cardToStorageItem(currentCard, {
      presetId: selectedPreset?.id,
      presetName: selectedPreset?.name,
      mode,
      model: settings.model,
      provider: providerFromBaseUrl(settings.baseUrl),
      baseUrl: settings.baseUrl,
      temperature: settings.temperature,
      sharedUniverse: sharedUniverse ? suMode : null,
      relations
    })

    // Guarda la tarjeta nueva y añade la relación inversa a las relacionadas.
    setCards(prev => {
      const withInverse = prev.map(c =>
        relIds.includes(c._id)
          ? { ...c, _relations: [...(c._relations || []).filter(r => r.targetId !== item._id), { targetId: item._id, name: item.data?.name || 'Personaje', type: 'universo', note: '' }] }
          : c
      )
      return [item, ...withInverse]
    })
    setSaved(true)
    addToast(`"${currentCard.data?.name || 'Personaje'}" guardado${relations.length ? ` · ${relations.length} relación(es)` : ''}`, 'success')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const forceGenerate = () => {
    sendMessage('Ya tengo suficiente información. Por favor genera la tarjeta completa en formato JSON ahora.')
  }

  const clearConversation = () => {
    setMessages([])
    setCurrentCard(null)
    setCoworkStep(0)
    setSaved(false)
    setUsedRelationIds([])
  }

  const coworkProgress = Math.round((coworkStep / (COWORK_STEPS.length - 1)) * 100)

  const universeCards = sharedUniverse
    ? (suMode === 'manual' ? cards.filter(c => selectedRelatedIds.includes(c._id)) : cards)
    : []

  return (
    <div className="chat-create">
      {/* Toolbar */}
      <div className="chat-toolbar">
        <span className="chat-toolbar-title">✦</span>

        <select
          className="preset-select"
          value={selectedPresetId}
          onChange={e => setSelectedPresetId(e.target.value)}
        >
          {presets.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'chat' ? 'active' : ''}`}
            onClick={() => handleModeChange('chat')}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Chat
          </button>
          <button
            className={`mode-btn ${mode === 'cowork' ? 'active' : ''}`}
            onClick={() => handleModeChange('cowork')}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            Co-work
          </button>
        </div>

        {/* Universo compartido */}
        <div className="su-toggle">
          <label className="switch" title="Universo compartido">
            <input type="checkbox" checked={sharedUniverse} onChange={e => setSharedUniverse(e.target.checked)} />
            <span className="switch-slider" />
          </label>
          <span className="su-label">🌐 Universo</span>
          {sharedUniverse && (
            <>
              <div className="su-mini-toggle">
                <button className={`su-mini-btn ${suMode === 'auto' ? 'active' : ''}`} onClick={() => setSuMode('auto')} title="La IA detecta automáticamente los personajes mencionados">Auto</button>
                <button className={`su-mini-btn ${suMode === 'manual' ? 'active' : ''}`} onClick={() => setSuMode('manual')} title="Selecciona manualmente las tarjetas relacionadas">Manual</button>
              </div>
              {suMode === 'manual' && (
                <button className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(true)}>
                  Tarjetas ({selectedRelatedIds.length})
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {mode === 'cowork' && messages.length === 0 && (
          <button className="btn btn-primary btn-sm" onClick={startCowork} disabled={isLoading}>
            Iniciar Co-work
          </button>
        )}

        {mode === 'cowork' && messages.length > 4 && !currentCard && (
          <button className="btn btn-secondary btn-sm" onClick={forceGenerate} disabled={isLoading}>
            ⚡ Generar ahora
          </button>
        )}

        {messages.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={clearConversation}>
            Limpiar
          </button>
        )}

        {isLoading && abortRef.current && (
          <button className="btn btn-danger btn-sm" onClick={() => abortRef.current?.abort()}>
            ◼ Detener
          </button>
        )}
      </div>

      {/* Co-work progress bar */}
      {mode === 'cowork' && messages.length > 0 && (
        <div className="cowork-progress">
          <span className="cowork-label">Progreso: {COWORK_STEPS[Math.min(coworkStep, COWORK_STEPS.length - 1)]}</span>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${coworkProgress}%` }} />
          </div>
          <span className="cowork-label">{coworkProgress}%</span>
        </div>
      )}

      {/* Body: chat + preview */}
      <div className="chat-body">
        {/* Chat panel */}
        <div className="chat-panel">
          {sharedUniverse && universeCards.length > 0 && (
            <div className="universe-bg" aria-hidden="true">
              {universeCards.map(c => (
                <div key={c._id} className="universe-bg-item">
                  {c._avatar ? <img src={c._avatar} alt="" /> : <span>{(c.data?.name || '?').charAt(0).toUpperCase()}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="messages-list">
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', textAlign: 'center', color: 'var(--text-4)', padding: '40px' }}>
                <div style={{ fontSize: '64px', opacity: 0.3 }}>
                  {mode === 'cowork' ? '🤝' : '✦'}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-3)' }}>
                  {mode === 'cowork' ? 'Modo Co-work' : 'Crear con IA'}
                </div>
                <div style={{ fontSize: '13px', maxWidth: '320px', lineHeight: 1.7 }}>
                  {mode === 'cowork'
                    ? 'Haz clic en "Iniciar Co-work" y la IA te guiará con preguntas para diseñar tu personaje.'
                    : `Describe el personaje que quieres crear. Puedes ser tan detallado como quieras.\n\nPreset activo: ${selectedPreset?.name || 'Ninguno'}`}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <Message
                key={msg.id}
                msg={msg}
                thinkingOpen={thinkingOpen}
                setThinkingOpen={setThinkingOpen}
                aiAvatar={selectedPreset?.image}
                aiName={selectedPreset?.name}
              />
            ))}

            {isLoading && messages[messages.length - 1]?.isStreaming === false && (
              <div className="message assistant">
                <div className="message-role">IA</div>
                <div className="message-bubble">
                  <div className="typing-indicator">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {(mode === 'chat' || (mode === 'cowork' && messages.length > 0)) && (
            <div className="chat-input-area">
              <div className="chat-input-row">
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  placeholder={mode === 'cowork' ? 'Responde a la IA...' : 'Describe el personaje que quieres crear...'}
                  value={input}
                  onChange={e => { setInput(e.target.value); autoResize(e.target) }}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  className="chat-send-btn"
                  onClick={() => sendMessage(input)}
                  disabled={isLoading || !input.trim()}
                  title="Enviar (Enter)"
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>
                Enter para enviar · Shift+Enter para nueva línea · Modelo: <strong>{settings.model || 'no configurado'}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div className="preview-panel">
          <div className="preview-header">
            <span className="preview-title">
              Vista previa
              {currentCard && !saved && <span className="unsaved-badge" title="Cambios sin guardar">● Sin guardar</span>}
              {currentCard && saved && <span className="saved-badge">✓ Guardada</span>}
            </span>
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
                <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
                  La tarjeta aparecerá aquí cuando la IA genere un JSON válido
                </div>
              </div>
            ) : previewTab === 'fields' ? (
              <CardFields card={currentCard} />
            ) : (
              <div className="json-viewer">{JSON.stringify(currentCard, null, 2)}</div>
            )}
          </div>

          {currentCard && (
            <div className="preview-actions">
              {!saved ? (
                <button className="btn btn-primary w-full" onClick={saveCard}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Guardar tarjeta
                </button>
              ) : (
                <button className="btn btn-success w-full" onClick={() => navigate('/')}>
                  ✓ Guardada — Ver dashboard
                </button>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => downloadCard({ ...currentCard, _id: '', _createdAt: '', _updatedAt: '', _meta: {} })}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Descargar .json
                </button>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => { setCurrentCard(null); setSaved(false) }}>
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card picker modal (manual shared universe) */}
      {pickerOpen && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🌐 Tarjetas relacionadas</span>
              <button className="modal-close" onClick={() => setPickerOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-muted">Selecciona las tarjetas con las que el nuevo personaje podría tener relación. La IA leerá sus datos para mantener coherencia.</p>
              {cards.length === 0 ? (
                <div className="text-muted" style={{ textAlign: 'center', padding: '20px' }}>No hay tarjetas guardadas todavía.</div>
              ) : (
                <div className="picker-list">
                  {cards.map(c => {
                    const sel = selectedRelatedIds.includes(c._id)
                    return (
                      <div key={c._id} className={`picker-item ${sel ? 'selected' : ''}`}
                        onClick={() => setSelectedRelatedIds(prev => sel ? prev.filter(id => id !== c._id) : [...prev, c._id])}>
                        <div className="picker-check">{sel ? '✓' : ''}</div>
                        <div className="picker-avatar">{(c.data?.name || '?').charAt(0).toUpperCase()}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }} className="truncate">{c.data?.name || 'Sin nombre'}</div>
                          <div className="truncate" style={{ fontSize: '12px', color: 'var(--text-4)' }}>{(c.data?.description || c.data?.personality || '').slice(0, 80)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {selectedRelatedIds.length > 0 && (
                <button className="btn btn-ghost" onClick={() => setSelectedRelatedIds([])}>Limpiar selección</button>
              )}
              <button className="btn btn-primary" onClick={() => setPickerOpen(false)}>Listo ({selectedRelatedIds.length})</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
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

function Message({ msg, thinkingOpen, setThinkingOpen, aiAvatar, aiName }) {
  const isUser = msg.role === 'user'
  const hasThinking = Boolean(msg.thinkingContent)
  const isOpen = thinkingOpen[msg.id]

  return (
    <div className={`message ${msg.role} ${msg.isError ? 'error' : ''}`}>
      <div className="message-role">
        {!isUser && aiAvatar && <img src={aiAvatar} alt="" className="msg-avatar" />}
        {isUser ? 'Tú' : (aiName || 'IA')}
      </div>

      {hasThinking && (
        <div className="message-thinking">
          <div className="thinking-header" onClick={() => setThinkingOpen(p => ({ ...p, [msg.id]: !p[msg.id] }))}>
            <span className="thinking-icon" style={{ animation: msg.isStreaming ? 'spin 2s linear infinite' : 'none' }}>⟳</span>
            <span>Razonamiento interno</span>
            <span style={{ marginLeft: 'auto' }}>{isOpen ? '▲' : '▼'}</span>
          </div>
          {isOpen && (
            <div className="thinking-body">{msg.thinkingContent}</div>
          )}
        </div>
      )}

      <div className="message-bubble">
        {msg.content || (msg.isStreaming ? '' : '...')}
        {msg.isStreaming && <span style={{ opacity: 0.5, animation: 'pulse 1s ease-in-out infinite' }}>▋</span>}
      </div>
    </div>
  )
}

function CardFields({ card }) {
  const d = card.data
  const fields = [
    { key: 'name', label: 'Nombre', value: d.name },
    { key: 'description', label: 'Descripción', value: d.description },
    { key: 'personality', label: 'Personalidad', value: d.personality },
    { key: 'scenario', label: 'Escenario', value: d.scenario },
    { key: 'first_mes', label: 'Primer mensaje', value: d.first_mes },
    { key: 'mes_example', label: 'Ejemplo de diálogo', value: d.mes_example },
    { key: 'creator_notes', label: 'Notas del creador', value: d.creator_notes },
    { key: 'system_prompt', label: 'System Prompt', value: d.system_prompt },
    { key: 'tags', label: 'Etiquetas', value: Array.isArray(d.tags) ? d.tags.join(', ') : d.tags },
    { key: 'creator', label: 'Creador', value: d.creator },
  ].filter(f => f.value)

  return (
    <div className="card-fields">
      {d.name && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-3)', borderRadius: 'var(--radius-md)', marginBottom: '4px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, var(--accent-1), var(--accent-3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {d.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)' }}>{d.name}</div>
            {d.character_version && <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>v{d.character_version}</div>}
          </div>
        </div>
      )}

      {fields.filter(f => f.key !== 'name').map(f => (
        <div key={f.key} className="card-field">
          <div className="card-field-label">{f.label}</div>
          <div className={`card-field-value ${!f.value ? 'empty' : ''}`}>
            {f.value || '(vacío)'}
          </div>
        </div>
      ))}

      {Array.isArray(d.alternate_greetings) && d.alternate_greetings.length > 0 && (
        <div className="card-field">
          <div className="card-field-label">Saludos alternativos ({d.alternate_greetings.length})</div>
          {d.alternate_greetings.map((g, i) => (
            <div key={i} className="alt-greeting">
              <span className="alt-greeting-num">#{i + 1}</span>
              <span className="alt-greeting-text">{g}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
