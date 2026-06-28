import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { downloadCard, CARD_FIELD_LABELS, cardToStorageItem, extractTranslatedCard, cleanPromptOutput } from '../utils/cardSchema.js'
import { streamChat } from '../utils/aiClient.js'

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const EDITABLE_FIELDS = [
  'name', 'description', 'personality', 'scenario',
  'first_mes', 'mes_example', 'creator_notes', 'system_prompt',
  'post_history_instructions', 'creator', 'character_version'
]

// Campos que se traducen (no incluye name ni tags, que son nombres propios / keywords)
const TRANSLATABLE_FIELDS = ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'post_history_instructions']

function translationPrompt(targetName) {
  return `Eres un traductor experto de tarjetas de personaje de SillyTavern. Traduce los campos de texto al ${targetName} de forma natural y fluida, conservando tono y estilo.

Reglas:
- Conserva EXACTAMENTE los marcadores {{user}} y {{char}}.
- Conserva el formato, los saltos de línea y los marcadores <START> de mes_example.
- NO traduzcas nombres propios.
- Devuelve ÚNICAMENTE el resultado entre estos marcadores, con JSON VÁLIDO (escapa saltos de línea como \\n y comillas como \\"):

<<<CARD_JSON>>>
{ "description": "...", "personality": "...", "scenario": "...", "first_mes": "...", "mes_example": "...", "creator_notes": "...", "post_history_instructions": "...", "alternate_greetings": ["..."] }
<<<END_CARD_JSON>>>

Incluye en el JSON solo los campos que recibas con contenido.`
}

const SD_PROMPT = `Eres un experto creando prompts para Stable Diffusion en estilo Danbooru/booru (etiquetas en inglés separadas por comas).

Recibirás una PLANTILLA con marcadores entre < > y la información de un personaje. Tu tarea es sustituir ÚNICAMENTE los marcadores < > por etiquetas que describan ese aspecto del personaje.

Reglas estrictas:
- Mantén TODO lo demás de la plantilla EXACTAMENTE igual: LoRA (<lora:...>), tags de calidad, BREAK, pesos como (tag:1.4), comas, estructura y saltos de línea.
- NO traduzcas ni modifiques los <lora:...>; déjalos tal cual.
- Sustituye cada marcador por etiquetas booru concisas en inglés (ej: blue eyes, long hair, school uniform, big breasts, wide hips).
- Marcadores por zonas: "Upper" = cabeza/cara/pelo/ojos/expresión; "Medium" = torso/pecho/ropa superior; "Bottom" = cintura/caderas/ropa inferior/piernas. Si el marcador tiene otro nombre, infiere su significado.
- Usa pesos (tag:1.2-1.5) solo cuando aporte, como en el ejemplo.
- Devuelve ÚNICAMENTE el prompt final resultante. Sin explicaciones, sin comillas de código, sin texto adicional.`

export default function CardPreview({ cards, setCards, settings, imagePresets = [] }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('view')
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [toasts, setToasts] = useState([])

  // Translation modal
  const [translateOpen, setTranslateOpen] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translateResult, setTranslateResult] = useState(null)
  const [translateTarget, setTranslateTarget] = useState('en')

  // Stable Diffusion modal
  const [sdOpen, setSdOpen] = useState(false)
  const [sdPresetId, setSdPresetId] = useState(imagePresets[0]?.id || '')
  const [sdTemplate, setSdTemplate] = useState(imagePresets[0]?.template || '')
  const [sdGenerating, setSdGenerating] = useState(false)
  const [sdResult, setSdResult] = useState('')
  const sdAbortRef = useRef(null)

  const cardIndex = cards.findIndex(c => c._id === id)
  const card = cards[cardIndex]

  const addToast = (msg, type = 'info') => {
    const id_ = Date.now()
    setToasts(p => [...p, { id: id_, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id_)), 3000)
  }

  if (!card) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', opacity: 0.3, marginBottom: '16px' }}>🔍</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '8px' }}>Tarjeta no encontrada</div>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Volver al dashboard</button>
      </div>
    )
  }

  const d = card.data

  const startEdit = (field, val) => {
    setEditing(field)
    setEditValue(Array.isArray(val) ? val.join('\n') : (val || ''))
  }

  const saveField = (field) => {
    const isArray = field === 'alternate_greetings' || field === 'tags'
    const newVal = isArray
      ? editValue.split('\n').map(s => s.trim()).filter(Boolean)
      : editValue

    const updated = {
      ...card,
      _updatedAt: new Date().toISOString(),
      data: { ...card.data, [field]: newVal }
    }
    const newCards = [...cards]
    newCards[cardIndex] = updated
    setCards(newCards)
    setEditing(null)
    addToast('Campo actualizado', 'success')
  }

  const deleteCard = () => {
    if (!confirm('¿Eliminar esta tarjeta permanentemente?')) return
    setCards(prev => prev.filter(c => c._id !== id))
    navigate('/')
  }

  // ── Translation ──
  const openTranslate = () => {
    setTranslateResult(null)
    setTranslateOpen(true)
  }

  const doTranslate = async (target) => {
    if (!settings?.apiKey) { addToast('Configura tu API key en Configuración', 'error'); return }
    setTranslateTarget(target)
    setTranslating(true)
    setTranslateResult(null)

    const targetName = target === 'en' ? 'inglés (English)' : 'español'
    const fields = {}
    TRANSLATABLE_FIELDS.forEach(f => { if (d[f]) fields[f] = d[f] })
    if (Array.isArray(d.alternate_greetings) && d.alternate_greetings.length) {
      fields.alternate_greetings = d.alternate_greetings
    }

    try {
      const full = await streamChat({
        settings,
        messages: [
          { role: 'system', content: translationPrompt(targetName) },
          { role: 'user', content: `Traduce estos campos al ${targetName}:\n${JSON.stringify(fields, null, 2)}` }
        ]
      })
      const parsed = extractTranslatedCard(full)
      if (!parsed) throw new Error('No se pudo interpretar la traducción devuelta')
      setTranslateResult(parsed)
    } catch (err) {
      addToast(`Error al traducir: ${err.message}`, 'error')
    } finally {
      setTranslating(false)
    }
  }

  const applyTranslation = (asCopy) => {
    if (!translateResult) return
    const t = translateResult
    const newData = { ...card.data }
    ;[...TRANSLATABLE_FIELDS, 'alternate_greetings'].forEach(f => {
      if (t[f] !== undefined && t[f] !== null && (typeof t[f] !== 'string' || t[f].trim())) {
        newData[f] = t[f]
      }
    })

    const langTag = translateTarget === 'en' ? 'EN' : 'ES'

    if (asCopy) {
      const item = cardToStorageItem(
        { spec: card.spec, spec_version: card.spec_version, data: { ...newData, name: `${card.data.name} (${langTag})` } },
        { mode: 'translation' }
      )
      setCards(prev => [item, ...prev])
      addToast(`Copia traducida (${langTag}) guardada`, 'success')
      setTranslateOpen(false)
      setTranslateResult(null)
      navigate(`/card/${item._id}`)
    } else {
      const updated = { ...card, _updatedAt: new Date().toISOString(), data: newData }
      const nc = [...cards]
      nc[cardIndex] = updated
      setCards(nc)
      addToast(`Tarjeta traducida a ${langTag}`, 'success')
      setTranslateOpen(false)
      setTranslateResult(null)
    }
  }

  // ── Stable Diffusion prompt ──
  const openSd = () => {
    const preset = imagePresets.find(p => p.id === sdPresetId) || imagePresets[0]
    if (preset) {
      setSdPresetId(preset.id)
      setSdTemplate(preset.template)
    }
    setSdResult('')
    setSdOpen(true)
  }

  const onSelectSdPreset = (pid) => {
    setSdPresetId(pid)
    const preset = imagePresets.find(p => p.id === pid)
    if (preset) setSdTemplate(preset.template)
    setSdResult('')
  }

  const doGenerateSd = async () => {
    if (!settings?.apiKey) { addToast('Configura tu API key en Configuración', 'error'); return }
    if (!sdTemplate.trim()) { addToast('La plantilla está vacía', 'error'); return }
    setSdGenerating(true)
    setSdResult('')

    const charInfo = [
      `Nombre: ${d.name || '(sin nombre)'}`,
      d.description && `Descripción: ${d.description}`,
      d.personality && `Personalidad: ${d.personality}`,
      d.scenario && `Escenario: ${d.scenario}`,
      d.tags?.length && `Etiquetas: ${d.tags.join(', ')}`
    ].filter(Boolean).join('\n')

    try {
      const controller = new AbortController()
      sdAbortRef.current = controller
      await streamChat({
        settings,
        signal: controller.signal,
        messages: [
          { role: 'system', content: SD_PROMPT },
          { role: 'user', content: `PLANTILLA:\n${sdTemplate}\n\nPERSONAJE:\n${charInfo}` }
        ],
        onDelta: (full) => setSdResult(cleanPromptOutput(full))
      })
    } catch (err) {
      if (err.name !== 'AbortError') addToast(`Error: ${err.message}`, 'error')
    } finally {
      setSdGenerating(false)
      sdAbortRef.current = null
    }
  }

  return (
    <div className="card-preview-page">
      {/* Header */}
      <div className="card-preview-header">
        <div className="card-preview-title-row">
          <div className="card-preview-avatar">{(d.name || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div className="card-preview-name">{d.name || 'Sin nombre'}</div>
            <div className="card-preview-meta">
              Creado el {formatDate(card._createdAt)}
              {card._meta?.presetName && ` · Preset: ${card._meta.presetName}`}
              {card._meta?.mode && ` · Modo: ${card._meta.mode}`}
            </div>
            {d.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {d.tags.map(t => <span key={t} className="tag tag-purple">{t}</span>)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
            ← Volver
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => downloadCard(card)}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Descargar .json
          </button>
          <button className="btn btn-danger btn-sm" onClick={deleteCard}>
            Eliminar
          </button>
        </div>
      </div>

      {/* Quick AI actions */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={openTranslate}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
          Traducir (ES ⇄ EN)
        </button>
        <button className="btn btn-primary btn-sm" onClick={openSd}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          Prompt de imagen (Stable Diffusion)
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--bg-2)', padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content' }}>
        {[['view', 'Vista'], ['edit', 'Editar campos'], ['json', 'JSON']].map(([k, l]) => (
          <button key={k} className={`preview-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* Content */}
      {tab === 'view' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {EDITABLE_FIELDS.filter(f => d[f]).map(field => (
            <div key={field} className="card-field">
              <div className="card-field-label">{CARD_FIELD_LABELS[field] || field}</div>
              <div className="card-field-value">{d[field]}</div>
            </div>
          ))}

          {d.alternate_greetings?.length > 0 && (
            <div className="card-field">
              <div className="card-field-label">Saludos alternativos ({d.alternate_greetings.length})</div>
              {d.alternate_greetings.map((g, i) => (
                <div key={i} className="alt-greeting" style={{ marginBottom: '8px' }}>
                  <span className="alt-greeting-num">#{i + 1}</span>
                  <span className="alt-greeting-text">{g}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'edit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {[...EDITABLE_FIELDS, 'alternate_greetings', 'tags'].map(field => {
            const val = d[field]
            const displayVal = Array.isArray(val) ? val.join('\n') : (val || '')
            const isEditing = editing === field
            const isLong = ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions'].includes(field)

            return (
              <div key={field} className="form-group">
                <label className="form-label">{CARD_FIELD_LABELS[field] || field}</label>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                      className="form-textarea"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      style={{ minHeight: isLong ? '160px' : '60px' }}
                      autoFocus
                    />
                    {(field === 'alternate_greetings' || field === 'tags') && (
                      <div className="form-hint">Un valor por línea</div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => saveField(field)}>Guardar</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="edit-field-area">
                    <div className={`card-field-value ${!displayVal ? 'empty' : ''}`} style={{ cursor: 'pointer' }} onClick={() => startEdit(field, val)}>
                      {displayVal || '(vacío — clic para editar)'}
                    </div>
                    <button className="edit-field-btn" onClick={() => startEdit(field, val)}>Editar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'json' && (
        <div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginBottom: '12px' }}
            onClick={() => { navigator.clipboard.writeText(JSON.stringify(card, null, 2)); addToast('JSON copiado al portapapeles', 'success') }}
          >
            Copiar JSON
          </button>
          <div className="json-viewer">{JSON.stringify({ spec: card.spec, spec_version: card.spec_version, data: card.data }, null, 2)}</div>
        </div>
      )}

      {/* ── Translation modal ── */}
      {translateOpen && (
        <div className="modal-overlay" onClick={() => !translating && setTranslateOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🌐 Traducir tarjeta</span>
              <button className="modal-close" onClick={() => !translating && setTranslateOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-muted">La IA traducirá los campos de texto (descripción, personalidad, escenario, mensajes, etc.) conservando {'{{user}}'}, {'{{char}}'} y el formato.</p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} disabled={translating} onClick={() => doTranslate('en')}>
                  → Inglés (English)
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} disabled={translating} onClick={() => doTranslate('es')}>
                  → Español
                </button>
              </div>

              {translating && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i}>
                      <span className="skeleton skeleton-line skeleton-w-40" style={{ height: '10px', marginBottom: '8px' }} />
                      <span className="skeleton skeleton-line skeleton-w-100" />
                      <span className="skeleton skeleton-line skeleton-w-90" />
                    </div>
                  ))}
                </div>
              )}

              {!translating && translateResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
                  <div className="tag tag-green" style={{ width: 'fit-content' }}>Traducción a {translateTarget === 'en' ? 'Inglés' : 'Español'} lista</div>
                  {TRANSLATABLE_FIELDS.filter(f => translateResult[f]).map(f => (
                    <div key={f} className="card-field">
                      <div className="card-field-label">{CARD_FIELD_LABELS[f] || f}</div>
                      <div className="card-field-value" style={{ maxHeight: '120px', overflowY: 'auto' }}>{translateResult[f]}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {translateResult && !translating && (
                <>
                  <button className="btn btn-secondary" onClick={() => applyTranslation(true)}>Guardar como copia</button>
                  <button className="btn btn-primary" onClick={() => applyTranslation(false)}>Reemplazar esta tarjeta</button>
                </>
              )}
              <button className="btn btn-ghost" onClick={() => !translating && setTranslateOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stable Diffusion modal ── */}
      {sdOpen && (
        <div className="modal-overlay" onClick={() => !sdGenerating && setSdOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <span className="modal-title">🎨 Prompt para Stable Diffusion</span>
              <button className="modal-close" onClick={() => !sdGenerating && setSdOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Plantilla de imagen</label>
                {imagePresets.length > 0 ? (
                  <select className="form-select" value={sdPresetId} onChange={e => onSelectSdPreset(e.target.value)}>
                    {imagePresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) : (
                  <div className="form-hint">No hay presets de imagen. Crea uno en la sección "Presets Imagen".</div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Plantilla (editable)</label>
                <textarea
                  className="form-textarea font-mono"
                  value={sdTemplate}
                  onChange={e => setSdTemplate(e.target.value)}
                  style={{ minHeight: '140px', fontSize: '12px' }}
                />
                <span className="form-hint">Los marcadores &lt;...&gt; se rellenarán con etiquetas del personaje. El resto se mantiene igual.</span>
              </div>

              <button className="btn btn-primary" onClick={doGenerateSd} disabled={sdGenerating}>
                {sdGenerating ? '⏳ Generando...' : '✨ Generar prompt'}
              </button>

              {sdGenerating && !sdResult && (
                <div style={{ marginTop: '8px' }}>
                  <span className="skeleton skeleton-line skeleton-w-100" />
                  <span className="skeleton skeleton-line skeleton-w-90" />
                  <span className="skeleton skeleton-line skeleton-w-100" />
                  <span className="skeleton skeleton-line skeleton-w-55" />
                </div>
              )}

              {sdResult && (
                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label className="form-label">Resultado</label>
                  <textarea
                    className="form-textarea font-mono"
                    value={sdResult}
                    onChange={e => setSdResult(e.target.value)}
                    style={{ minHeight: '160px', fontSize: '12px' }}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              {sdResult && (
                <button className="btn btn-secondary" onClick={() => { navigator.clipboard.writeText(sdResult); addToast('Prompt copiado al portapapeles', 'success') }}>
                  Copiar prompt
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => navigate('/image-presets')}>Gestionar presets</button>
              <button className="btn btn-ghost" onClick={() => !sdGenerating && setSdOpen(false)}>Cerrar</button>
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
