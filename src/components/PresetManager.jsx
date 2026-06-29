import { useState, useRef, useEffect } from 'react'
import { extractPresetFromText, stripPresetMarkers } from '../utils/cardSchema.js'
import { fileToResizedDataURL } from '../utils/image.js'
import { playPing } from '../utils/sound.js'

const MODE_LABELS = { chat: 'Chat', cowork: 'Co-work' }

const META_PRESET_PROMPT = `Eres un asistente experto que ayuda a diseñar PRESETS para "V's Card Creator", una app que crea tarjetas de personaje de SillyTavern (formato chara_card_v2) usando IA. Un preset define el SYSTEM PROMPT que guiará a la IA cuando cree las tarjetas, además de un nombre y una descripción.

El usuario conversará contigo en español para describir qué tipo de preset quiere (estilo, género, tono, enfoque, reglas especiales). Tu trabajo en CADA turno:

1. Responde de forma conversacional, breve y útil en español. Explica qué ajustaste y por qué, y haz alguna pregunta si falta información para mejorar el preset.
2. Compara SIEMPRE el estado actual de los campos (te lo proporcionaré) con lo que pide el usuario, y mejora a partir de ahí.
3. Al FINAL de tu mensaje incluye SIEMPRE el preset actualizado entre estos marcadores EXACTOS (nunca uses comillas triples):

<<<PRESET_JSON>>>
{
  "name": "Nombre corto y descriptivo del preset",
  "description": "Una frase explicando para qué sirve el preset",
  "system_prompt": "El prompt de sistema COMPLETO y detallado que recibirá la IA creadora de tarjetas. Debe indicar el estilo y enfoque, qué campos generar (name, description, personality, scenario, first_mes, mes_example, creator_notes, tags, alternate_greetings, etc.) y pedir explícitamente que entregue la tarjeta final como un objeto JSON con spec 'chara_card_v2'."
}
<<<END_PRESET_JSON>>>

Reglas importantes:
- Usa SIEMPRE los marcadores <<<PRESET_JSON>>> y <<<END_PRESET_JSON>>>; nunca uses comillas triples ni bloques markdown.
- El JSON debe ser VÁLIDO: escapa los saltos de línea dentro de las cadenas como \\n y las comillas como \\".
- Mantén "name" corto (2 a 5 palabras).
- El system_prompt debe ser profesional, específico y estar en español salvo que el usuario pida otro idioma.`

export default function PresetManager({ settings, presets, setPresets }) {
  const [editing, setEditing] = useState(null) // preset id or 'new'
  const [form, setForm] = useState({ name: '', description: '', mode: 'chat', systemPrompt: '', image: '' })
  const [toasts, setToasts] = useState([])
  const imageInputRef = useRef(null)

  // AI assist state
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [flashFields, setFlashFields] = useState(false)
  const aiAbortRef = useRef(null)
  const aiEndRef = useRef(null)

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  const resetAi = () => {
    aiAbortRef.current?.abort()
    setAiOpen(false)
    setAiMessages([])
    setAiInput('')
    setAiGenerating(false)
  }

  const openNew = () => {
    setForm({ name: '', description: '', mode: 'chat', systemPrompt: '', image: '' })
    setEditing('new')
    setAiMessages([])
  }

  const openEdit = (preset) => {
    setForm({
      name: preset.name,
      description: preset.description || '',
      mode: preset.mode || 'chat',
      systemPrompt: preset.systemPrompt || '',
      image: preset.image || ''
    })
    setEditing(preset.id)
    setAiMessages([])
  }

  const pickImage = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const dataUrl = await fileToResizedDataURL(file, 768, 0.9)
        setForm(p => ({ ...p, image: dataUrl }))
      } catch (err) {
        addToast(`No se pudo cargar la imagen: ${err.message}`, 'error')
      }
    }
    e.target.value = ''
  }

  const cancel = () => { setEditing(null); resetAi() }

  const save = () => {
    if (!form.name.trim()) { addToast('El preset necesita un nombre', 'error'); return }
    if (!form.systemPrompt.trim()) { addToast('El preset necesita un prompt', 'error'); return }

    if (editing === 'new') {
      const newPreset = {
        id: `preset-${Date.now()}`,
        name: form.name.trim(),
        description: form.description.trim(),
        mode: form.mode,
        systemPrompt: form.systemPrompt,
        image: form.image || '',
        isDefault: false,
        createdAt: new Date().toISOString()
      }
      setPresets(prev => [...prev, newPreset])
      addToast(`Preset "${newPreset.name}" creado`, 'success')
    } else {
      setPresets(prev => prev.map(p =>
        p.id === editing
          ? { ...p, name: form.name.trim(), description: form.description.trim(), mode: form.mode, systemPrompt: form.systemPrompt, image: form.image || '' }
          : p
      ))
      addToast('Preset actualizado', 'success')
    }
    setEditing(null)
    resetAi()
  }

  const deletePreset = (id) => {
    const p = presets.find(p => p.id === id)
    if (p?.isDefault) { addToast('No puedes eliminar un preset predeterminado', 'error'); return }
    if (!confirm('¿Eliminar este preset?')) return
    setPresets(prev => prev.filter(p => p.id !== id))
    addToast('Preset eliminado', 'info')
  }

  const duplicate = (preset) => {
    const copy = {
      ...preset,
      id: `preset-${Date.now()}`,
      name: `${preset.name} (copia)`,
      isDefault: false,
      createdAt: new Date().toISOString()
    }
    setPresets(prev => [...prev, copy])
    addToast(`Preset duplicado como "${copy.name}"`, 'success')
  }

  // ── AI assistant ──
  const sendAiMessage = async (text) => {
    if (!text.trim() || aiGenerating) return
    if (!settings?.apiKey) { addToast('Configura tu API key en Configuración', 'error'); return }

    const userMsg = { id: Date.now(), role: 'user', content: text.trim() }
    const aiId = Date.now() + 1

    const history = aiMessages.map(m => ({ role: m.role, content: m.content }))
    setAiMessages(prev => [...prev, userMsg, { id: aiId, role: 'assistant', content: '', isStreaming: true }])
    setAiInput('')
    setAiGenerating(true)

    const stateMsg = {
      role: 'system',
      content: `Estado actual de los campos del preset:\nNombre: ${form.name || '(vacío)'}\nDescripción: ${form.description || '(vacío)'}\nSystem Prompt:\n${form.systemPrompt || '(vacío)'}`
    }

    const apiMessages = [
      { role: 'system', content: META_PRESET_PROMPT },
      stateMsg,
      ...history,
      { role: 'user', content: text.trim() }
    ]

    try {
      const controller = new AbortController()
      aiAbortRef.current = controller

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
      let full = ''

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
              full += delta.content
              const display = stripPresetMarkers(full)
              setAiMessages(prev => prev.map(m =>
                m.id === aiId ? { ...m, content: display } : m
              ))
            }
          } catch {}
        }
      }

      // Final: extract preset and update preview fields
      const preset = extractPresetFromText(full)
      const display = stripPresetMarkers(full)

      setAiMessages(prev => prev.map(m =>
        m.id === aiId
          ? { ...m, content: display || (preset ? 'He actualizado el preset en la vista previa.' : full), isStreaming: false }
          : m
      ))
      if (settings.soundEnabled !== false) playPing()

      if (preset) {
        setForm(prev => ({
          ...prev,
          name: preset.name || prev.name,
          description: preset.description || prev.description,
          systemPrompt: preset.systemPrompt || prev.systemPrompt
        }))
        setFlashFields(true)
        setTimeout(() => setFlashFields(false), 700)
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        setAiMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: '[Generación cancelada]', isStreaming: false } : m
        ))
      } else {
        setAiMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: `Error: ${err.message}`, isStreaming: false, isError: true } : m
        ))
        addToast(`Error: ${err.message}`, 'error')
      }
    } finally {
      setAiGenerating(false)
      aiAbortRef.current = null
    }
  }

  const handleAiKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendAiMessage(aiInput)
    }
  }

  const showFieldSkeleton = aiOpen && aiGenerating

  return (
    <div className="presets-page">
      <div className="page-header" style={{ paddingLeft: 0, paddingRight: 0, paddingTop: 0 }}>
        <div>
          <h1 className="page-title">Presets</h1>
          <p className="page-subtitle">Gestiona los prompts de sistema para la creación de tarjetas</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo Preset
        </button>
      </div>

      {/* Editor */}
      {editing && (
        <div className="preset-editor-layout">
          <div className="preset-editor">
            <div className="preset-editor-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{editing === 'new' ? '+ Nuevo preset' : `Editando: ${presets.find(p => p.id === editing)?.name}`}</span>
              <button
                className={`btn btn-sm ${aiOpen ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => setAiOpen(v => !v)}
                title="Diseña el preset conversando con la IA"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z"/><path d="M5 18l.8 1.9L7.7 21l-1.9.8L5 23.7 4.2 21.8 2.3 21l1.9-.8L5 18z"/></svg>
                {aiOpen ? 'Ocultar asistente' : 'Crear con IA'}
              </button>
            </div>

            <div className="settings-row">
              <div className="form-group">
                <label className="form-label">Nombre del preset *</label>
                {showFieldSkeleton ? (
                  <span className="skeleton skeleton-field" />
                ) : (
                  <input
                    className={`form-input ${flashFields ? 'field-updated' : ''}`}
                    placeholder="Ej: Personaje épico de fantasía"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Modo</label>
                <select
                  className="form-select"
                  value={form.mode}
                  onChange={e => setForm(p => ({ ...p, mode: e.target.value }))}
                >
                  <option value="chat">Chat (prompt directo)</option>
                  <option value="cowork">Co-work (preguntas guiadas)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Descripción</label>
              {showFieldSkeleton ? (
                <span className="skeleton skeleton-field" />
              ) : (
                <input
                  className={`form-input ${flashFields ? 'field-updated' : ''}`}
                  placeholder="Breve descripción de para qué sirve este preset"
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Imagen del "narrador" (opcional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div className="avatar-upload" onClick={() => imageInputRef.current?.click()} title="Subir imagen">
                  {form.image
                    ? <img src={form.image} alt="" className="avatar-upload-img" />
                    : <span className="avatar-upload-placeholder">＋</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => imageInputRef.current?.click()}>Subir imagen</button>
                  {form.image && <button className="btn btn-ghost btn-sm" onClick={() => setForm(p => ({ ...p, image: '' }))}>Quitar</button>}
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickImage} />
              </div>
              <span className="form-hint">Se mostrará como icono del preset y como avatar de la IA al crear tarjetas con él.</span>
            </div>

            <div className="form-group">
              <label className="form-label">System Prompt *</label>
              {showFieldSkeleton ? (
                <span className="skeleton skeleton-field tall" />
              ) : (
                <textarea
                  className={`form-textarea ${flashFields ? 'field-updated' : ''}`}
                  placeholder="Instrucciones completas para la IA sobre cómo crear tarjetas..."
                  value={form.systemPrompt}
                  onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
                  style={{ minHeight: '300px', fontFamily: 'inherit' }}
                />
              )}
              <span className="form-hint">
                {'Usa {{user}} y {{char}} como marcadores. Incluye instrucciones para generar el JSON final en un bloque ```json.'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-ghost" onClick={cancel}>Cancelar</button>
              <button className="btn btn-primary" onClick={save}>
                {editing === 'new' ? 'Crear preset' : 'Guardar cambios'}
              </button>
            </div>
          </div>

          {/* AI assist chat panel (cajón a la derecha) */}
          {aiOpen && <div className="ai-drawer-overlay" onClick={() => setAiOpen(false)} />}
          {aiOpen && (
            <div className="ai-assist-panel">
              <div className="ai-assist-header">
                <span className="ai-assist-title">
                  <svg width="16" height="16" fill="none" stroke="var(--accent-4)" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z"/></svg>
                  Asistente de presets
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {aiMessages.length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setAiMessages([])} title="Reiniciar conversación">
                      Limpiar
                    </button>
                  )}
                  <button className="modal-close" onClick={() => setAiOpen(false)} title="Cerrar">✕</button>
                </div>
              </div>

              <div className="messages-list">
                {aiMessages.length === 0 && (
                  <div className="ai-assist-empty">
                    <div className="ai-assist-empty-icon">✨</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-3)' }}>Diseña tu preset con IA</div>
                    <div style={{ fontSize: '12px', lineHeight: 1.7 }}>
                      Describe qué tipo de preset quieres (estilo, género, tono...) y la IA rellenará automáticamente el Nombre, la Descripción y el System Prompt. Puedes seguir conversando para ajustarlo.
                    </div>
                  </div>
                )}

                {aiMessages.map(msg => (
                  <div key={msg.id} className={`message ${msg.role} ${msg.isError ? 'error' : ''}`}>
                    <div className="message-role">{msg.role === 'user' ? 'Tú' : 'IA'}</div>
                    {msg.role === 'assistant' && msg.isStreaming && !msg.content ? (
                      <div className="skeleton-bubble">
                        <span className="skeleton skeleton-line skeleton-w-90" />
                        <span className="skeleton skeleton-line skeleton-w-100" />
                        <span className="skeleton skeleton-line skeleton-w-70" />
                        <span className="skeleton skeleton-line skeleton-w-40" />
                      </div>
                    ) : (
                      <div className="message-bubble">
                        {msg.content}
                        {msg.isStreaming && <span style={{ opacity: 0.5 }}>▋</span>}
                      </div>
                    )}
                  </div>
                ))}

                <div ref={aiEndRef} />
              </div>

              <div className="chat-input-area">
                <div className="chat-input-row">
                  <textarea
                    className="chat-textarea"
                    placeholder="Ej: Quiero un preset para villanos carismáticos de ciencia ficción..."
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    onKeyDown={handleAiKeyDown}
                    rows={1}
                    disabled={aiGenerating}
                  />
                  {aiGenerating ? (
                    <button className="chat-send-btn" onClick={() => aiAbortRef.current?.abort()} title="Detener" style={{ background: 'var(--error)' }}>
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                    </button>
                  ) : (
                    <button className="chat-send-btn" onClick={() => sendAiMessage(aiInput)} disabled={!aiInput.trim()} title="Enviar (Enter)">
                      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>
                  Enter para enviar · La IA actualizará los campos de la izquierda
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Presets grid */}
      <div className="presets-grid">
        {presets.map(preset => (
          <div key={preset.id} className={`preset-card ${editing === preset.id ? 'selected' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                {preset.image && <img src={preset.image} alt="" className="preset-avatar" />}
                <div className="preset-card-name">{preset.name}</div>
              </div>
              {preset.isDefault && <span className="tag tag-purple" style={{ flexShrink: 0 }}>Default</span>}
            </div>
            <div className="preset-card-mode">Modo: {MODE_LABELS[preset.mode] || preset.mode}</div>
            {preset.description && <div className="preset-card-desc">{preset.description}</div>}
            <div className="preset-card-desc" style={{ fontFamily: 'monospace', fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
              {preset.systemPrompt.slice(0, 120)}...
            </div>
            <div className="preset-card-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(preset)}>
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => duplicate(preset)} title="Duplicar">
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
              {!preset.isDefault && (
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => deletePreset(preset.id)} title="Eliminar">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

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
