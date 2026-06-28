import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { downloadCard, CARD_FIELD_LABELS, cardToStorageItem, extractTranslatedCard, cleanPromptOutput, stripCardMarkers } from '../utils/cardSchema.js'
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

const CARD_EDIT_PROMPT = `Eres un editor experto de tarjetas de personaje de SillyTavern (formato chara_card_v2). Ayudas al usuario a MODIFICAR una tarjeta existente conversando con él.

En cada turno te proporcionaré el estado ACTUAL de la tarjeta (JSON). El usuario te pedirá cambios.

Tu trabajo:
1. Responde de forma breve y conversacional en español, explicando qué cambiaste y por qué. Haz preguntas si algo no está claro.
2. Aplica SOLO los cambios solicitados; conserva el resto de los campos tal cual están.
3. Conserva EXACTAMENTE los marcadores {{user}} y {{char}} y el formato.
4. Al FINAL de tu mensaje incluye SIEMPRE la tarjeta COMPLETA y actualizada entre estos marcadores EXACTOS (nunca uses comillas triples), con JSON VÁLIDO (escapa los saltos de línea como \\n y las comillas como \\"):

<<<CARD_JSON>>>
{
  "name": "...",
  "description": "...",
  "personality": "...",
  "scenario": "...",
  "first_mes": "...",
  "mes_example": "...",
  "creator_notes": "...",
  "system_prompt": "...",
  "post_history_instructions": "...",
  "alternate_greetings": ["..."],
  "tags": ["..."],
  "creator": "...",
  "character_version": "..."
}
<<<END_CARD_JSON>>>

Incluye SIEMPRE todos los campos que tenga la tarjeta (aunque no cambien) para no perder información.`

const SD_PROMPT = `Eres un experto creando prompts para Stable Diffusion en estilo Danbooru/booru (etiquetas en inglés separadas por comas).

Recibirás una PLANTILLA con marcadores entre < > y la información de un personaje. Tu tarea es sustituir ÚNICAMENTE los marcadores < > por etiquetas que describan ese aspecto del personaje.

Reglas estrictas:
- Mantén TODO lo demás de la plantilla EXACTAMENTE igual: LoRA (<lora:...>), tags de calidad, BREAK, pesos como (tag:1.4), comas, estructura y saltos de línea.
- NO traduzcas ni modifiques los <lora:...>; déjalos tal cual.
- Sustituye cada marcador por etiquetas booru concisas en inglés (ej: blue eyes, long hair, school uniform, big breasts, wide hips).
- Marcadores por zonas: "Upper" = cabeza/cara/pelo/ojos/expresión; "Medium" = torso/pecho/ropa superior; "Bottom" = cintura/caderas/ropa inferior/piernas. Si el marcador tiene otro nombre, infiere su significado.
- Usa pesos (tag:1.2-1.5) solo cuando aporte, como en el ejemplo.
- Devuelve ÚNICAMENTE el prompt final resultante. Sin explicaciones, sin comillas de código, sin texto adicional.`

export default function CardPreview({ cards, setCards, settings, imagePresets = [], presets = [] }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState('view')
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [toasts, setToasts] = useState([])

  // AI edit chat panel
  const [aiEditOpen, setAiEditOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [flashFields, setFlashFields] = useState(false)
  const aiAbortRef = useRef(null)
  const aiEndRef = useRef(null)
  const autoOpenedRef = useRef(false)

  // Relations
  const [relAddOpen, setRelAddOpen] = useState(false)
  const [relTarget, setRelTarget] = useState('')
  const [relType, setRelType] = useState('')
  const [relNote, setRelNote] = useState('')
  const [relApplyAI, setRelApplyAI] = useState(false)
  const [relPresetId, setRelPresetId] = useState(presets[0]?.id || '')
  const [relBusy, setRelBusy] = useState(false)

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

  // ── AI edit chat ──
  const sendAiEdit = async (text) => {
    if (!text.trim() || aiGenerating) return
    if (!settings?.apiKey) { addToast('Configura tu API key en Configuración', 'error'); return }

    const userMsg = { id: Date.now(), role: 'user', content: text.trim() }
    const aiId = Date.now() + 1
    const history = aiMessages.map(m => ({ role: m.role, content: m.content }))

    setAiMessages(prev => [...prev, userMsg, { id: aiId, role: 'assistant', content: '', isStreaming: true }])
    setAiInput('')
    setAiGenerating(true)

    const currentCardJson = JSON.stringify(card.data, null, 2)
    const apiMessages = [
      { role: 'system', content: CARD_EDIT_PROMPT },
      { role: 'system', content: `Estado ACTUAL de la tarjeta:\n${currentCardJson}` },
      ...history,
      { role: 'user', content: text.trim() }
    ]

    try {
      const controller = new AbortController()
      aiAbortRef.current = controller
      const full = await streamChat({
        settings,
        signal: controller.signal,
        messages: apiMessages,
        onDelta: (acc) => {
          const display = stripCardMarkers(acc)
          setAiMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: display } : m))
        }
      })

      const parsed = extractTranslatedCard(full)
      const display = stripCardMarkers(full)
      setAiMessages(prev => prev.map(m =>
        m.id === aiId
          ? { ...m, content: display || (parsed ? 'He actualizado la tarjeta.' : full), isStreaming: false }
          : m
      ))

      if (parsed) {
        const allowed = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version']
        const newData = { ...card.data }
        allowed.forEach(k => { if (parsed[k] !== undefined) newData[k] = parsed[k] })
        const updated = { ...card, _updatedAt: new Date().toISOString(), data: newData }
        setCards(prev => prev.map(c => c._id === id ? updated : c))
        setFlashFields(true)
        setTimeout(() => setFlashFields(false), 700)
      } else {
        addToast('La IA respondió pero no se pudo aplicar la actualización', 'info')
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setAiMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: '[Generación cancelada]', isStreaming: false } : m))
      } else {
        setAiMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: `Error: ${err.message}`, isStreaming: false, isError: true } : m))
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
      sendAiEdit(aiInput)
    }
  }

  // Auto-scroll del chat
  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  // Auto-abrir un panel según ?panel=edit|sd (al llegar desde el dashboard)
  useEffect(() => {
    if (autoOpenedRef.current || !card) return
    const panel = searchParams.get('panel')
    if (panel === 'edit') { setAiEditOpen(true); autoOpenedRef.current = true; setSearchParams({}, { replace: true }) }
    else if (panel === 'sd') { openSd(); autoOpenedRef.current = true; setSearchParams({}, { replace: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, card])

  // ── Relations ──
  const relations = card._relations || []

  const removeRelation = (targetId) => {
    setCards(prev => prev.map(c => {
      if (c._id === id) return { ...c, _relations: (c._relations || []).filter(r => r.targetId !== targetId) }
      if (c._id === targetId) return { ...c, _relations: (c._relations || []).filter(r => r.targetId !== id) }
      return c
    }))
    addToast('Relación eliminada', 'info')
  }

  const addRelation = async () => {
    if (!relTarget) { addToast('Selecciona una tarjeta', 'error'); return }
    const target = cards.find(c => c._id === relTarget)
    if (!target) return
    const type = relType.trim() || 'relación'
    const note = relNote.trim()

    // Relación bidireccional
    setCards(prev => prev.map(c => {
      if (c._id === id) return { ...c, _relations: [...(c._relations || []).filter(r => r.targetId !== relTarget), { targetId: relTarget, name: target.data?.name || 'Personaje', type, note }] }
      if (c._id === relTarget) return { ...c, _relations: [...(c._relations || []).filter(r => r.targetId !== id), { targetId: id, name: card.data?.name || 'Personaje', type, note }] }
      return c
    }))

    if (relApplyAI) {
      await applyRelationWithAI(target, type, note)
    } else {
      addToast('Relación añadida', 'success')
    }
    setRelAddOpen(false)
    setRelTarget(''); setRelType(''); setRelNote(''); setRelApplyAI(false)
  }

  // Ajusta esta tarjeta con IA para reflejar una relación, según el preset elegido.
  const applyRelationWithAI = async (target, type, note) => {
    if (!settings?.apiKey) { addToast('Configura tu API key para ajustar con IA', 'error'); return }
    const preset = presets.find(p => p.id === relPresetId)
    setRelBusy(true)
    try {
      const sys = `${CARD_EDIT_PROMPT}\n\n${preset ? `Estilo/preset a tener en cuenta:\n${preset.systemPrompt}` : ''}`
      const userMsg = `Ajusta LIGERAMENTE la tarjeta actual para reflejar de forma coherente esta relación con otro personaje del universo. No reescribas todo: introduce guiños, coherencia de mundo y matices acordes.

RELACIÓN: ${card.data?.name} es ${type} de ${target.data?.name}.${note ? ` Nota: ${note}` : ''}

DATOS DEL OTRO PERSONAJE (${target.data?.name}):
${JSON.stringify(target.data, null, 2)}

TARJETA ACTUAL A AJUSTAR (${card.data?.name}):
${JSON.stringify(card.data, null, 2)}`

      const full = await streamChat({
        settings,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }]
      })
      const parsed = extractTranslatedCard(full)
      if (parsed) {
        const allowed = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version']
        const newData = { ...card.data }
        allowed.forEach(k => { if (parsed[k] !== undefined) newData[k] = parsed[k] })
        setCards(prev => prev.map(c => c._id === id ? { ...c, _updatedAt: new Date().toISOString(), data: newData } : c))
        setFlashFields(true)
        setTimeout(() => setFlashFields(false), 700)
        addToast('Relación añadida y tarjeta ajustada con IA', 'success')
      } else {
        addToast('Relación añadida (la IA no devolvió cambios aplicables)', 'info')
      }
    } catch (err) {
      addToast(`Relación añadida, pero falló el ajuste IA: ${err.message}`, 'error')
    } finally {
      setRelBusy(false)
    }
  }

  const flashClass = flashFields ? 'field-updated' : ''
  const meta = card._meta || {}
  const relatableCards = cards.filter(c => c._id !== id && !relations.some(r => r.targetId === c._id))

  return (
    <div className="card-preview-page" style={aiEditOpen ? { maxWidth: 'none' } : undefined}>
      <div className={aiEditOpen ? 'card-preview-layout' : undefined}>
      <div className={aiEditOpen ? 'card-preview-main' : undefined}>
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
        <button className={`btn btn-sm ${aiEditOpen ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setAiEditOpen(v => !v)}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          {aiEditOpen ? 'Ocultar asistente' : 'Editar con IA'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={openTranslate}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
          Traducir (ES ⇄ EN)
        </button>
        <button className="btn btn-primary btn-sm" onClick={openSd}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          Prompt de imagen (Stable Diffusion)
        </button>
      </div>

      {/* Relations (shared universe) */}
      <div className="relations-section">
        <div className="relations-header">
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>🌐 Relaciones de universo</span>
          <button className="btn btn-secondary btn-sm" onClick={() => { setRelTarget(''); setRelType(''); setRelNote(''); setRelApplyAI(false); setRelAddOpen(true) }} disabled={relatableCards.length === 0}>
            + Añadir relación
          </button>
        </div>
        {relations.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '13px' }}>
            {relatableCards.length === 0 && cards.length <= 1
              ? 'Crea más tarjetas para poder relacionarlas entre sí.'
              : 'Sin relaciones. Vincula este personaje con otros del universo (familiar, rival, pareja, mismo mundo…).'}
          </div>
        ) : (
          <div className="relations-list">
            {relations.map(r => {
              const exists = cards.some(c => c._id === r.targetId)
              return (
                <div key={r.targetId} className="relation-item">
                  <span className="relation-type">{r.type}</span>
                  <span className="relation-name" onClick={() => exists && navigate(`/card/${r.targetId}`)} title={exists ? 'Abrir tarjeta' : 'Tarjeta eliminada'} style={{ opacity: exists ? 1 : 0.5 }}>
                    {r.name}{!exists && ' (eliminada)'}
                  </span>
                  {r.note && <span className="relation-note">— {r.note}</span>}
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ marginLeft: 'auto' }} title="Quitar relación" onClick={() => removeRelation(r.targetId)}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Creation details */}
      {(meta.model || meta.provider || meta.presetName || meta.mode) && (
        <div className="relations-section">
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '12px' }}>🛠️ Detalles de creación</div>
          <div className="creation-details">
            {meta.provider && <Detail label="Distribuidor" value={meta.provider} />}
            {meta.model && <Detail label="Modelo" value={meta.model} />}
            {meta.mode && <Detail label="Modo" value={meta.mode === 'cowork' ? 'Co-work' : meta.mode === 'translation' ? 'Traducción' : meta.mode === 'import' ? 'Importada' : 'Chat'} />}
            {meta.presetName && <Detail label="Preset" value={meta.presetName} />}
            {meta.temperature !== null && meta.temperature !== undefined && <Detail label="Temperature" value={String(meta.temperature)} />}
            {meta.sharedUniverse && <Detail label="Universo compartido" value={meta.sharedUniverse === 'manual' ? 'Manual' : 'Automático'} />}
            <Detail label="Creada" value={formatDate(card._createdAt)} />
            {card._updatedAt && card._updatedAt !== card._createdAt && <Detail label="Editada" value={formatDate(card._updatedAt)} />}
          </div>
        </div>
      )}

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
              <div className={`card-field-value ${flashClass}`}>{d[field]}</div>
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
      </div>{/* /card-preview-main */}

      {/* AI edit chat panel */}
      {aiEditOpen && (
        <aside className="ai-assist-panel card-edit-panel">
          <div className="ai-assist-header">
            <span className="ai-assist-title">
              <svg width="16" height="16" fill="none" stroke="var(--accent-4)" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              Editar con IA
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {aiMessages.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setAiMessages([])} title="Reiniciar conversación">Limpiar</button>
              )}
              <button className="modal-close" onClick={() => setAiEditOpen(false)} title="Cerrar">✕</button>
            </div>
          </div>

          <div className="messages-list">
            {aiMessages.length === 0 && (
              <div className="ai-assist-empty">
                <div className="ai-assist-empty-icon">✏️</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-3)' }}>Edita esta tarjeta con IA</div>
                <div style={{ fontSize: '12px', lineHeight: 1.7 }}>
                  Pide cambios en lenguaje natural (ej: "hazla más tímida", "añade un trasfondo trágico", "cambia el escenario a una cafetería"). La IA actualizará la tarjeta y verás los campos cambiar a la izquierda.
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
                placeholder="Pide un cambio a la tarjeta..."
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
                <button className="chat-send-btn" onClick={() => sendAiEdit(aiInput)} disabled={!aiInput.trim()} title="Enviar (Enter)">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>
              Enter para enviar · Los cambios se guardan automáticamente
            </div>
          </div>
        </aside>
      )}
      </div>{/* /card-preview-layout */}

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

      {/* ── Add relation modal ── */}
      {relAddOpen && (
        <div className="modal-overlay" onClick={() => !relBusy && setRelAddOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🌐 Añadir relación</span>
              <button className="modal-close" onClick={() => !relBusy && setRelAddOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tarjeta relacionada *</label>
                <select className="form-select" value={relTarget} onChange={e => setRelTarget(e.target.value)}>
                  <option value="">Selecciona una tarjeta...</option>
                  {relatableCards.map(c => <option key={c._id} value={c._id}>{c.data?.name || 'Sin nombre'}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de relación</label>
                <input className="form-input" placeholder="hermana, rival, pareja, mentor, mismo mundo..." value={relType} onChange={e => setRelType(e.target.value)} list="rel-types" />
                <datalist id="rel-types">
                  <option value="hermana" /><option value="hermano" /><option value="madre" /><option value="padre" />
                  <option value="hija" /><option value="hijo" /><option value="pareja" /><option value="amiga" />
                  <option value="amigo" /><option value="rival" /><option value="enemiga" /><option value="enemigo" />
                  <option value="mentor" /><option value="aprendiz" /><option value="mismo mundo" />
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">Nota (opcional)</label>
                <textarea className="form-textarea" style={{ minHeight: '60px' }} placeholder="Detalles del vínculo..." value={relNote} onChange={e => setRelNote(e.target.value)} />
              </div>

              <div className="switch-row" style={{ borderTop: '1px solid var(--border-1)', paddingTop: '16px' }}>
                <div className="switch-info">
                  <div className="switch-info-title">Ajustar esta tarjeta con IA</div>
                  <div className="switch-info-desc">La IA modificará ligeramente este personaje para reflejar la relación, según el preset elegido.</div>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={relApplyAI} disabled={relBusy} onChange={e => setRelApplyAI(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>

              {relApplyAI && (
                <div className="form-group">
                  <label className="form-label">Preset para el ajuste</label>
                  <select className="form-select" value={relPresetId} onChange={e => setRelPresetId(e.target.value)}>
                    {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {relBusy && (
                <div style={{ marginTop: '4px' }}>
                  <span className="skeleton skeleton-line skeleton-w-100" />
                  <span className="skeleton skeleton-line skeleton-w-90" />
                  <span className="skeleton skeleton-line skeleton-w-55" />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => !relBusy && setRelAddOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={addRelation} disabled={relBusy || !relTarget}>
                {relBusy ? '⏳ Ajustando...' : (relApplyAI ? 'Añadir y ajustar con IA' : 'Añadir relación')}
              </button>
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

function Detail({ label, value }) {
  return (
    <div className="creation-detail">
      <div className="creation-detail-label">{label}</div>
      <div className="creation-detail-value">{value}</div>
    </div>
  )
}
