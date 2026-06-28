import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { downloadCard, normalizeCard, cardToStorageItem } from '../utils/cardSchema.js'

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function thisWeek(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  return diff < 7 * 24 * 60 * 60 * 1000
}

export default function Dashboard({ cards, setCards, settings }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState(null)
  const [toasts, setToasts] = useState([])
  const fileRef = useRef()

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  const allTags = useMemo(() => {
    const counts = {}
    cards.forEach(c => (c.data?.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1 }))
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t)
  }, [cards])

  const filtered = useMemo(() => {
    let list = [...cards].sort((a, b) => new Date(b._createdAt) - new Date(a._createdAt))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.data?.name || '').toLowerCase().includes(q) ||
        (c.data?.description || '').toLowerCase().includes(q) ||
        (c.data?.tags || []).some(t => t.toLowerCase().includes(q))
      )
    }
    if (activeTag) {
      list = list.filter(c => (c.data?.tags || []).includes(activeTag))
    }
    return list
  }, [cards, search, activeTag])

  const stats = useMemo(() => ({
    total: cards.length,
    thisWeek: cards.filter(c => thisWeek(c._createdAt)).length,
    tags: allTags.length,
    last: cards.length ? formatDate(cards.slice().sort((a, b) => new Date(b._createdAt) - new Date(a._createdAt))[0]._createdAt) : '—'
  }), [cards, allTags])

  const deleteCard = (id, e) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar esta tarjeta?')) return
    setCards(prev => prev.filter(c => c._id !== id))
    addToast('Tarjeta eliminada', 'info')
  }

  const handleImport = (e) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result)
          const card = normalizeCard(parsed)
          const item = cardToStorageItem(card, { mode: 'import' })
          setCards(prev => [item, ...prev])
          addToast(`"${card.data.name || 'Personaje'}" importado`, 'success')
        } catch {
          addToast('Error al importar archivo JSON', 'error')
        }
      }
      reader.readAsText(file)
    })
    e.target.value = ''
  }

  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'))
    if (!files.length) { addToast('Solo se aceptan archivos .json', 'error'); return }
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result)
          const card = normalizeCard(parsed)
          const item = cardToStorageItem(card, { mode: 'import' })
          setCards(prev => [item, ...prev])
          addToast(`"${card.data.name || 'Personaje'}" importado`, 'success')
        } catch {
          addToast('Error al importar archivo JSON', 'error')
        }
      }
      reader.readAsText(file)
    })
  }

  return (
    <div className="dashboard"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="page-header" style={{ paddingLeft: 0, paddingRight: 0, paddingTop: 0 }}>
        <div>
          <h1 className="page-title">Mis Tarjetas</h1>
          <p className="page-subtitle">Gestiona y descarga tus personajes de SillyTavern</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Importar JSON
          </button>
          <input ref={fileRef} type="file" accept=".json" multiple style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/create')}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva Tarjeta
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        {[
          { value: stats.total, label: 'Total tarjetas', icon: '🃏' },
          { value: stats.thisWeek, label: 'Esta semana', icon: '📅' },
          { value: stats.tags, label: 'Etiquetas únicas', icon: '🏷️' },
          { value: stats.last, label: 'Última creación', icon: '✨', small: true }
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <span className="stat-icon">{s.icon}</span>
            <span className="stat-value" style={{ fontSize: s.small ? '16px' : undefined, paddingTop: s.small ? '8px' : undefined }}>{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div>
        <div className="dashboard-toolbar">
          <div className="search-input-wrap">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="search-input"
              placeholder="Buscar por nombre, descripción o etiqueta..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setActiveTag(null) }}>
            Limpiar filtros
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="tag-filter" style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-4)', marginRight: '4px' }}>Tags:</span>
            {allTags.map(t => (
              <button
                key={t}
                className={`tag-filter-btn ${activeTag === t ? 'active' : ''}`}
                onClick={() => setActiveTag(activeTag === t ? null : t)}
              >{t}</button>
            ))}
          </div>
        )}
      </div>

      {/* Drop hint when dragging */}
      {dragOver && (
        <div className="drop-zone drag-over" style={{ position: 'fixed', inset: 0, zIndex: 100, borderRadius: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'rgba(10,10,25,0.85)' }}>
          <div style={{ fontSize: '64px' }}>📄</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-4)' }}>Suelta para importar tarjeta</div>
        </div>
      )}

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🃏</div>
          <div className="empty-state-title">{cards.length === 0 ? 'No hay tarjetas aún' : 'Sin resultados'}</div>
          <p className="empty-state-desc">
            {cards.length === 0
              ? 'Crea tu primera tarjeta de personaje con IA. Selecciona "Nueva Tarjeta" para comenzar.'
              : 'Ninguna tarjeta coincide con tu búsqueda. Prueba con otros términos.'}
          </p>
          {cards.length === 0 && (
            <button className="btn btn-primary" onClick={() => navigate('/create')}>
              ✦ Crear primera tarjeta
            </button>
          )}
        </div>
      ) : (
        <div className="cards-grid">
          {filtered.map(card => (
            <CharCard
              key={card._id}
              card={card}
              onClick={() => navigate(`/card/${card._id}`)}
              onEditAi={(e) => { e.stopPropagation(); navigate(`/card/${card._id}?panel=edit`) }}
              onSdPrompt={(e) => { e.stopPropagation(); navigate(`/card/${card._id}?panel=sd`) }}
              onDownload={(e) => { e.stopPropagation(); downloadCard(card) }}
              onDelete={(e) => deleteCard(card._id, e)}
            />
          ))}
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

function CharCard({ card, onClick, onDownload, onDelete, onEditAi, onSdPrompt }) {
  const name = card.data?.name || 'Sin nombre'
  const desc = card.data?.description || card.data?.personality || ''
  const tags = (card.data?.tags || []).slice(0, 4)
  const initial = name.charAt(0).toUpperCase()
  const date = formatDate(card._createdAt)

  return (
    <div className="char-card" onClick={onClick}>
      <div className="char-card-header">
        <div className="char-avatar">{initial}</div>
        <div className="char-card-info">
          <div className="char-card-name">{name}</div>
          <div className="char-card-date">{date}</div>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="char-card-tags">
          {tags.map(t => <span key={t} className="tag tag-purple">{t}</span>)}
          {(card.data?.tags || []).length > 4 && (
            <span className="tag">+{(card.data?.tags || []).length - 4}</span>
          )}
        </div>
      )}

      {desc && <p className="char-card-desc">{desc}</p>}

      <div className="char-card-actions">
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={e => { e.stopPropagation(); onClick() }}>
          Ver
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" title="Editar con IA" onClick={onEditAi}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" title="Prompt de imagen (Stable Diffusion)" onClick={onSdPrompt}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" title="Descargar JSON" onClick={onDownload}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </button>
        <button className="btn btn-danger btn-sm btn-icon" title="Eliminar" onClick={onDelete}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
  )
}
