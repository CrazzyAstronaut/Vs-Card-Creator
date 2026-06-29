import { useState, useRef } from 'react'
import { DEFAULT_PRESETS } from '../utils/defaultPresets.js'
import { mergeByKey, mergeSettings } from '../utils/sync.js'
import { fileToResizedDataURL } from '../utils/image.js'

const PRESET_MODELS = [
  { label: 'DeepSeek R1 (thinking)', value: 'deepseek/deepseek-r1' },
  { label: 'DeepSeek V3', value: 'deepseek/deepseek-chat' },
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
  { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
  { label: 'Gemini 2.0 Flash', value: 'google/gemini-2.0-flash-exp' },
  { label: 'Llama 3.3 70B', value: 'meta-llama/llama-3.3-70b-instruct' },
  { label: 'Qwen 2.5 72B', value: 'qwen/qwen-2.5-72b-instruct' },
]

export default function Settings({ settings, setSettings, cards, setCards, presets, setPresets, imagePresets = [], setImagePresets }) {
  const backupInputRef = useRef(null)
  const userAvatarRef = useRef(null)

  const pickUserAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const dataUrl = await fileToResizedDataURL(file, 768, 0.9)
        setSettings(s => ({ ...s, userAvatar: dataUrl }))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err)
      }
    }
    e.target.value = ''
  }
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [testMsg, setTestMsg] = useState('')
  const [toasts, setToasts] = useState([])
  const [customModel, setCustomModel] = useState(!PRESET_MODELS.find(m => m.value === settings.model))

  // Modelos cargados dinámicamente desde la API (respetan el filtro "solo suscripción")
  const [fetchedModels, setFetchedModels] = useState([])
  const [modelsStatus, setModelsStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [modelsMeta, setModelsMeta] = useState(null)

  const isNanoProvider = /nano-?gpt\.com/i.test(settings.baseUrl || '')

  // Opciones del desplegable: modelos cargados de la API, o la lista de ejemplo si no se han cargado.
  const modelOptions = fetchedModels.length > 0
    ? fetchedModels.map(m => ({ value: m.id, label: m.name ? `${m.name} (${m.id})` : m.id }))
    : PRESET_MODELS

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }))

  const loadModels = async (subscriptionOnlyOverride) => {
    if (!settings.apiKey) { addToast('Ingresa una API key primero', 'error'); return }
    if (!settings.baseUrl) { addToast('Ingresa una Base URL', 'error'); return }

    const subscriptionOnly = subscriptionOnlyOverride ?? settings.subscriptionOnly
    setModelsStatus('loading')
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: settings.apiKey, baseUrl: settings.baseUrl, subscriptionOnly })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `Error ${res.status}`)
      }
      const data = await res.json()
      setFetchedModels(data.models || [])
      setModelsMeta(data.meta || null)
      setModelsStatus('ok')
      addToast(`${data.models?.length || 0} modelos cargados${data.meta?.subscriptionApplied ? ' (solo suscripción)' : ''}`, 'success')
    } catch (err) {
      setModelsStatus('error')
      addToast(`Error al cargar modelos: ${err.message}`, 'error')
    }
  }

  const toggleSubscriptionOnly = (checked) => {
    update('subscriptionOnly', checked)
    // Si ya hay modelos cargados, recargar con el nuevo filtro
    if (fetchedModels.length > 0 || modelsStatus === 'ok') {
      loadModels(checked)
    }
  }

  const testConnection = async () => {
    if (!settings.apiKey) { addToast('Ingresa una API key primero', 'error'); return }
    if (!settings.baseUrl) { addToast('Ingresa una Base URL', 'error'); return }
    if (!settings.model) { addToast('Ingresa un modelo', 'error'); return }

    setTestStatus('loading')
    setTestMsg('')

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: settings.model,
          messages: [{ role: 'user', content: 'Di "OK" en una palabra.' }],
          temperature: 0.1,
          maxTokens: 10,
          stream: false
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `Error ${res.status}`)
      }

      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || '(respuesta vacía)'
      setTestStatus('ok')
      setTestMsg(`✓ Conexión exitosa — Respuesta: "${reply.trim()}"`)
    } catch (err) {
      setTestStatus('error')
      setTestMsg(`✗ ${err.message}`)
    }
  }

  const clearAllData = () => {
    if (!confirm('¿Borrar TODAS las tarjetas guardadas? Esta acción no se puede deshacer.')) return
    setCards([])
    addToast('Todas las tarjetas fueron eliminadas', 'info')
  }

  const resetPresets = () => {
    if (!confirm('¿Restaurar los presets a los valores predeterminados? Se perderán los presets personalizados.')) return
    setPresets(DEFAULT_PRESETS)
    addToast('Presets restaurados', 'success')
  }

  const exportAllCards = () => {
    if (!cards.length) { addToast('No hay tarjetas para exportar', 'error'); return }
    const json = JSON.stringify(cards.map(({ _id, _createdAt, _updatedAt, _meta, ...c }) => c), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vcc-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast(`${cards.length} tarjetas exportadas`, 'success')
  }

  // Copia de seguridad COMPLETA (tarjetas + presets + presets de imagen + ajustes)
  const exportFullBackup = () => {
    const data = {
      _type: 'vcc-full-backup',
      _version: 1,
      exportedAt: new Date().toISOString(),
      cards, presets, imagePresets, settings
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vcc-respaldo-completo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('Copia de seguridad completa exportada', 'success')
  }

  const importFullBackup = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const data = JSON.parse(await file.text())
        if (Array.isArray(data.cards)) setCards(prev => mergeByKey(prev, data.cards, '_id', ['_updatedAt', '_createdAt']))
        if (Array.isArray(data.presets) && data.presets.length) setPresets(prev => mergeByKey(prev, data.presets, 'id', ['createdAt']))
        if (Array.isArray(data.imagePresets) && data.imagePresets.length && setImagePresets) setImagePresets(prev => mergeByKey(prev, data.imagePresets, 'id', ['createdAt']))
        if (data.settings && typeof data.settings === 'object') setSettings(prev => mergeSettings(prev, data.settings))
        addToast('Copia de seguridad importada y fusionada', 'success')
      } catch (err) {
        addToast(`Archivo inválido: ${err.message}`, 'error')
      }
    }
    e.target.value = ''
  }

  return (
    <div className="settings-page">
      <div>
        <h1 className="page-title">Configuración</h1>
        <p className="page-subtitle">Configura la conexión a la API y las preferencias de la aplicación</p>
      </div>

      {/* API Configuration */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-icon">🔑</span>
          <span className="settings-section-title">Conexión a la API</span>
        </div>
        <div className="settings-section-body">
          <div className="form-group">
            <label className="form-label">API Key</label>
            <div className="input-row">
              <input
                className="form-input"
                type={showKey ? 'text' : 'password'}
                placeholder="sk-... o tu API key del proveedor"
                value={settings.apiKey}
                onChange={e => update('apiKey', e.target.value)}
              />
              <button className="input-row-btn" onClick={() => setShowKey(v => !v)} title={showKey ? 'Ocultar' : 'Mostrar'}>
                {showKey ? (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            <span className="form-hint">La API key se guarda localmente en tu navegador. Nunca se envía a ningún servidor excepto al proveedor de IA.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Base URL</label>
            <input
              className="form-input"
              placeholder="https://api.nano-gpt.com/v1"
              value={settings.baseUrl}
              onChange={e => update('baseUrl', e.target.value)}
            />
            <span className="form-hint">
              Endpoint compatible con OpenAI Chat Completions. Ejemplos:
              <code style={{ fontSize: '11px', background: 'var(--bg-4)', padding: '1px 6px', borderRadius: '4px', marginLeft: '4px' }}>
                https://api.openai.com/v1
              </code>
            </span>
          </div>

          {/* Solo suscripción switch */}
          <div className="switch-row">
            <div className="switch-info">
              <div className="switch-info-title">
                Solo suscripción
                {!isNanoProvider && <span className="tag" style={{ fontSize: '10px' }}>solo nanogpt</span>}
              </div>
              <div className="switch-info-desc">
                Muestra únicamente los modelos incluidos en la suscripción de nanogpt (no los de pago por uso).
                {!isNanoProvider && ' El filtro solo aplica con un Base URL de nano-gpt.com.'}
              </div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.subscriptionOnly)}
                disabled={!isNanoProvider}
                onChange={e => toggleSubscriptionOnly(e.target.checked)}
              />
              <span className="switch-slider" />
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Modelo</label>
            {!customModel ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="form-select"
                  style={{ flex: 1 }}
                  value={modelOptions.find(m => m.value === settings.model) ? settings.model : ''}
                  onChange={e => update('model', e.target.value)}
                >
                  <option value="">Selecciona un modelo...</option>
                  {modelOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => setCustomModel(true)}>Personalizado</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="form-input"
                  placeholder="nombre-del-modelo"
                  value={settings.model}
                  onChange={e => update('model', e.target.value)}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setCustomModel(false)}>Lista</button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => loadModels()}
                disabled={modelsStatus === 'loading'}
              >
                {modelsStatus === 'loading' ? '⏳ Cargando...' : '↻ Cargar modelos desde la API'}
              </button>
              {modelsStatus === 'ok' && modelsMeta && (
                <span className="form-hint" style={{ margin: 0 }}>
                  {fetchedModels.length} modelos
                  {modelsMeta.subscriptionApplied
                    ? ' · filtrados por suscripción'
                    : modelsMeta.subscriptionRequested && !modelsMeta.isNano
                      ? ' · (filtro de suscripción ignorado: no es nanogpt)'
                      : ''}
                </span>
              )}
            </div>
            <span className="form-hint">
              Los modelos con "thinking" (R1, o1, etc.) activan automáticamente la visualización del razonamiento interno.
              {fetchedModels.length === 0 && ' Sin cargar, se muestra una lista corta de ejemplo.'}
            </span>
          </div>

          {/* Test connection */}
          <div className="connection-test">
            <button
              className="btn btn-secondary btn-sm"
              onClick={testConnection}
              disabled={testStatus === 'loading'}
              style={{ flexShrink: 0 }}
            >
              {testStatus === 'loading' ? '⏳ Probando...' : '⚡ Probar conexión'}
            </button>
            {testMsg && (
              <span className={`connection-test-msg ${testStatus}`}>{testMsg}</span>
            )}
          </div>
        </div>
      </div>

      {/* Generation settings */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-icon">⚙️</span>
          <span className="settings-section-title">Parámetros de generación</span>
        </div>
        <div className="settings-section-body">
          <div className="settings-row">
            <div className="form-group">
              <label className="form-label">Temperature: {settings.temperature}</label>
              <input
                type="range"
                min="0" max="2" step="0.05"
                value={settings.temperature}
                onChange={e => update('temperature', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-3)' }}
              />
              <span className="form-hint">0 = determinista, 1 = creativo, 2 = caótico</span>
            </div>

            <div className="form-group">
              <label className="form-label">Max tokens</label>
              <input
                className="form-input"
                type="number"
                min="512"
                max="32768"
                step="512"
                value={settings.maxTokens}
                onChange={e => update('maxTokens', parseInt(e.target.value))}
              />
              <span className="form-hint">Máximo de tokens por respuesta (recomendado: 8192)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Creator defaults */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-icon">👤</span>
          <span className="settings-section-title">Datos del creador</span>
        </div>
        <div className="settings-section-body">
          <div className="form-group">
            <label className="form-label">Nombre del creador (por defecto)</label>
            <input
              className="form-input"
              placeholder="Tu nombre o pseudónimo"
              value={settings.creatorName}
              onChange={e => update('creatorName', e.target.value)}
            />
            <span className="form-hint">Se añadirá automáticamente al campo "creator" de cada tarjeta generada.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Tu avatar (persona)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div className="avatar-upload" onClick={() => userAvatarRef.current?.click()} title="Subir avatar">
                {settings.userAvatar
                  ? <img src={settings.userAvatar} alt="" className="avatar-upload-img" />
                  : <span className="avatar-upload-placeholder">＋</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => userAvatarRef.current?.click()}>Subir avatar</button>
                {settings.userAvatar && <button className="btn btn-ghost btn-sm" onClick={() => update('userAvatar', '')}>Quitar</button>}
              </div>
              <input ref={userAvatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickUserAvatar} />
            </div>
            <span className="form-hint">Se muestra como tu retrato en el chat al crear tarjetas.</span>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-icon">🔔</span>
          <span className="settings-section-title">Preferencias</span>
        </div>
        <div className="settings-section-body">
          <div className="switch-row">
            <div className="switch-info">
              <div className="switch-info-title">Sonido de notificación</div>
              <div className="switch-info-desc">Reproduce un "ping" cuando la IA termina de responder.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={settings.soundEnabled !== false} onChange={e => update('soundEnabled', e.target.checked)} />
              <span className="switch-slider" />
            </label>
          </div>

          <div className="divider" />

          <div className="switch-row">
            <div className="switch-info">
              <div className="switch-info-title">Prompt de imagen automático</div>
              <div className="switch-info-desc">Al guardar una tarjeta, genera automáticamente su prompt de Stable Diffusion con el preset de imagen elegido.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={Boolean(settings.autoImagePrompt)} onChange={e => update('autoImagePrompt', e.target.checked)} />
              <span className="switch-slider" />
            </label>
          </div>
          {settings.autoImagePrompt && (
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Preset de imagen para el auto-prompt</label>
              <select className="form-select" value={settings.autoImagePresetId || ''} onChange={e => update('autoImagePresetId', e.target.value)}>
                <option value="">{imagePresets[0]?.name ? `Por defecto (${imagePresets[0].name})` : 'Sin presets de imagen'}</option>
                {imagePresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span className="form-hint">El preset elegido queda fijo y no cambia con el tiempo.</span>
            </div>
          )}
        </div>
      </div>

      {/* Data management */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-icon">🗄️</span>
          <span className="settings-section-title">Gestión de datos</span>
        </div>
        <div className="settings-section-body">
          <div style={{ fontSize: '12px', color: 'var(--text-3)', background: 'var(--bg-3)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-md)', padding: '12px 14px', lineHeight: 1.6, marginBottom: '12px' }}>
            ☁️ <strong>Sincronización entre dispositivos:</strong> tus tarjetas, presets y ajustes se guardan también en el servidor, así se comparten automáticamente entre todos los dispositivos que abran la app (PC, móvil por Tailscale, etc.). Si tus datos antiguos no aparecen aquí, ábrelos en el navegador/dirección donde sí se ven y usa <strong>"Copia de seguridad completa"</strong> para traerlos.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', background: 'var(--bg-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-glow)' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>Copia de seguridad completa</div>
                <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '2px' }}>Tarjetas + presets + presets de imagen + ajustes (incluye API key)</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button className="btn btn-secondary btn-sm" onClick={exportFullBackup}>Exportar</button>
                <button className="btn btn-secondary btn-sm" onClick={() => backupInputRef.current?.click()}>Importar</button>
                <input ref={backupInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importFullBackup} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--bg-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-1)' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>Exportar todas las tarjetas</div>
                <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '2px' }}>{cards.length} tarjeta{cards.length !== 1 ? 's' : ''} guardada{cards.length !== 1 ? 's' : ''} (solo tarjetas, formato ST)</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={exportAllCards}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Exportar
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--bg-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-1)' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>Restaurar presets</div>
                <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '2px' }}>Vuelve a los presets predeterminados</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={resetPresets}>Restaurar</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--error-bg)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--error)' }}>Borrar todas las tarjetas</div>
                <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '2px' }}>Esta acción es irreversible</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={clearAllData}>Borrar todo</button>
            </div>
          </div>
        </div>
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
