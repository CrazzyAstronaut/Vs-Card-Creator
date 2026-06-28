import { useState } from 'react'

const MODE_LABELS = { chat: 'Chat', cowork: 'Co-work' }

export default function PresetManager({ presets, setPresets }) {
  const [editing, setEditing] = useState(null) // preset id or 'new'
  const [form, setForm] = useState({ name: '', description: '', mode: 'chat', systemPrompt: '' })
  const [toasts, setToasts] = useState([])

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }

  const openNew = () => {
    setForm({ name: '', description: '', mode: 'chat', systemPrompt: '' })
    setEditing('new')
  }

  const openEdit = (preset) => {
    setForm({
      name: preset.name,
      description: preset.description || '',
      mode: preset.mode || 'chat',
      systemPrompt: preset.systemPrompt || ''
    })
    setEditing(preset.id)
  }

  const cancel = () => setEditing(null)

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
        isDefault: false,
        createdAt: new Date().toISOString()
      }
      setPresets(prev => [...prev, newPreset])
      addToast(`Preset "${newPreset.name}" creado`, 'success')
    } else {
      setPresets(prev => prev.map(p =>
        p.id === editing
          ? { ...p, name: form.name.trim(), description: form.description.trim(), mode: form.mode, systemPrompt: form.systemPrompt }
          : p
      ))
      addToast('Preset actualizado', 'success')
    }
    setEditing(null)
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
        <div className="preset-editor">
          <div className="preset-editor-title">
            {editing === 'new' ? '+ Nuevo preset' : `Editando: ${presets.find(p => p.id === editing)?.name}`}
          </div>

          <div className="settings-row">
            <div className="form-group">
              <label className="form-label">Nombre del preset *</label>
              <input
                className="form-input"
                placeholder="Ej: Personaje épico de fantasía"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              />
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
            <input
              className="form-input"
              placeholder="Breve descripción de para qué sirve este preset"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">System Prompt *</label>
            <textarea
              className="form-textarea"
              placeholder="Instrucciones completas para la IA sobre cómo crear tarjetas..."
              value={form.systemPrompt}
              onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
              style={{ minHeight: '300px', fontFamily: 'inherit' }}
            />
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
      )}

      {/* Presets grid */}
      <div className="presets-grid">
        {presets.map(preset => (
          <div key={preset.id} className={`preset-card ${editing === preset.id ? 'selected' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div className="preset-card-name">{preset.name}</div>
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
