import { useState } from 'react'
import { DEFAULT_PRESETS } from '../utils/defaultPresets.js'

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

export default function Settings({ settings, setSettings, cards, setCards, presets, setPresets }) {
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [testMsg, setTestMsg] = useState('')
  const [toasts, setToasts] = useState([])
  const [customModel, setCustomModel] = useState(!PRESET_MODELS.find(m => m.value === settings.model))

  const addToast = (msg, type = 'info') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }))

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

          <div className="form-group">
            <label className="form-label">Modelo</label>
            {!customModel ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="form-select"
                  style={{ flex: 1 }}
                  value={PRESET_MODELS.find(m => m.value === settings.model) ? settings.model : ''}
                  onChange={e => update('model', e.target.value)}
                >
                  <option value="">Selecciona un modelo...</option>
                  {PRESET_MODELS.map(m => (
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
            <span className="form-hint">Los modelos con "thinking" (R1, o1, etc.) activan automáticamente la visualización del razonamiento interno.</span>
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
        </div>
      </div>

      {/* Data management */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-icon">🗄️</span>
          <span className="settings-section-title">Gestión de datos</span>
        </div>
        <div className="settings-section-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--bg-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-1)' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>Exportar todas las tarjetas</div>
                <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '2px' }}>{cards.length} tarjeta{cards.length !== 1 ? 's' : ''} guardada{cards.length !== 1 ? 's' : ''}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={exportAllCards}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Exportar backup
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
