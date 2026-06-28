import { useState } from 'react'

// Detecta los marcadores < ... > de una plantilla para mostrarlos como ayuda.
function findPlaceholders(template) {
  const matches = [...(template || '').matchAll(/<([^<>]+)>/g)]
  // Excluye loras tipo <lora:nombre:1>
  return matches
    .map(m => m[1].trim())
    .filter(p => !/^lora:/i.test(p))
}

export default function ImagePresetManager({ imagePresets, setImagePresets }) {
  const [editing, setEditing] = useState(null) // id or 'new'
  const [form, setForm] = useState({ name: '', description: '', template: '' })
  const [toasts, setToasts] = useState([])

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }

  const openNew = () => {
    setForm({ name: '', description: '', template: '' })
    setEditing('new')
  }

  const openEdit = (preset) => {
    setForm({ name: preset.name, description: preset.description || '', template: preset.template || '' })
    setEditing(preset.id)
  }

  const cancel = () => setEditing(null)

  const save = () => {
    if (!form.name.trim()) { addToast('El preset necesita un nombre', 'error'); return }
    if (!form.template.trim()) { addToast('El preset necesita una plantilla', 'error'); return }

    if (editing === 'new') {
      const newPreset = {
        id: `imgpreset-${Date.now()}`,
        name: form.name.trim(),
        description: form.description.trim(),
        template: form.template,
        isDefault: false,
        createdAt: new Date().toISOString()
      }
      setImagePresets(prev => [...prev, newPreset])
      addToast(`Preset de imagen "${newPreset.name}" creado`, 'success')
    } else {
      setImagePresets(prev => prev.map(p =>
        p.id === editing
          ? { ...p, name: form.name.trim(), description: form.description.trim(), template: form.template }
          : p
      ))
      addToast('Preset de imagen actualizado', 'success')
    }
    setEditing(null)
  }

  const deletePreset = (id) => {
    const p = imagePresets.find(p => p.id === id)
    if (p?.isDefault) { addToast('No puedes eliminar un preset predeterminado', 'error'); return }
    if (!confirm('¿Eliminar este preset de imagen?')) return
    setImagePresets(prev => prev.filter(p => p.id !== id))
    addToast('Preset eliminado', 'info')
  }

  const duplicate = (preset) => {
    const copy = {
      ...preset,
      id: `imgpreset-${Date.now()}`,
      name: `${preset.name} (copia)`,
      isDefault: false,
      createdAt: new Date().toISOString()
    }
    setImagePresets(prev => [...prev, copy])
    addToast(`Preset duplicado como "${copy.name}"`, 'success')
  }

  const placeholders = findPlaceholders(form.template)

  return (
    <div className="presets-page">
      <div className="page-header" style={{ paddingLeft: 0, paddingRight: 0, paddingTop: 0 }}>
        <div>
          <h1 className="page-title">Presets de Imagen</h1>
          <p className="page-subtitle">Plantillas para generar prompts de Stable Diffusion a partir de tus tarjetas</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo Preset
        </button>
      </div>

      <div className="card" style={{ padding: '16px 20px', background: 'var(--bg-2)' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7 }}>
          💡 <strong>Cómo funciona:</strong> escribe una plantilla con marcadores entre <code style={{ background: 'var(--bg-4)', padding: '1px 6px', borderRadius: '4px' }}>&lt;corchetes angulares&gt;</code>.
          Al generar un prompt desde una tarjeta, la IA sustituye cada marcador por etiquetas tipo booru que describen
          ese aspecto del personaje, manteniendo el resto de la plantilla (LoRA, tags de calidad, <code style={{ background: 'var(--bg-4)', padding: '1px 6px', borderRadius: '4px' }}>BREAK</code>, pesos) intacto.
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <div className="preset-editor">
          <div className="preset-editor-title">
            {editing === 'new' ? '+ Nueva plantilla de imagen' : `Editando: ${imagePresets.find(p => p.id === editing)?.name}`}
          </div>

          <div className="form-group">
            <label className="form-label">Nombre del preset *</label>
            <input
              className="form-input"
              placeholder="Ej: Anime mujer (cuerpo completo)"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input
              className="form-input"
              placeholder="Para qué sirve esta plantilla"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Plantilla *</label>
            <textarea
              className="form-textarea font-mono"
              placeholder={'<lora:nombre:1>, (masterpiece), 1girl, BREAK,\n<Upper Description>, BREAK,\n<Medium Description>, BREAK,\n<Bottom Description>'}
              value={form.template}
              onChange={e => setForm(p => ({ ...p, template: e.target.value }))}
              style={{ minHeight: '220px', fontSize: '13px' }}
            />
            <span className="form-hint">
              Usa marcadores como &lt;Upper Description&gt;. Los LoRA (&lt;lora:...&gt;) se conservan tal cual.
            </span>
            {placeholders.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-4)' }}>Marcadores detectados:</span>
                {placeholders.map((p, i) => <span key={i} className="tag tag-blue">{p}</span>)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button className="btn btn-ghost" onClick={cancel}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}>
              {editing === 'new' ? 'Crear preset' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="presets-grid">
        {imagePresets.map(preset => (
          <div key={preset.id} className={`preset-card ${editing === preset.id ? 'selected' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div className="preset-card-name">{preset.name}</div>
              {preset.isDefault && <span className="tag tag-purple" style={{ flexShrink: 0 }}>Default</span>}
            </div>
            {preset.description && <div className="preset-card-desc">{preset.description}</div>}
            <pre style={{ fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: '11px', color: 'var(--text-3)', background: 'var(--bg-1)', padding: '10px', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '110px', overflow: 'hidden', margin: 0 }}>
              {preset.template}
            </pre>
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
