import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { downloadCard, CARD_FIELD_LABELS } from '../utils/cardSchema.js'

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

export default function CardPreview({ cards, setCards }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('view')
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [toasts, setToasts] = useState([])

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
