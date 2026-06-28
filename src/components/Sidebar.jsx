import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  {
    path: '/', label: 'Dashboard', end: true,
    icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  },
  {
    path: '/create', label: 'Nueva Tarjeta', end: false,
    icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
  },
  {
    path: '/presets', label: 'Presets', end: false,
    icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
  },
  {
    path: '/image-presets', label: 'Presets Imagen', end: false,
    icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
  },
  {
    path: '/settings', label: 'Configuración', end: false,
    icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  }
]

export default function Sidebar({ settings }) {
  const [isConnected, setIsConnected] = useState(null)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health')
        setIsConnected(res.ok)
      } catch {
        setIsConnected(false)
      }
    }
    check()
  }, [])

  const hasApiKey = Boolean(settings?.apiKey)

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">✦</div>
        <div>
          <span className="sidebar-title-main">V's</span>
          <span className="sidebar-title-sub">Card Creator</span>
        </div>
      </div>

      <div className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-status">
          <span className={`status-dot ${isConnected === null ? '' : isConnected ? 'connected' : 'error'}`} />
          <span style={{ fontSize: '11px' }}>
            {isConnected === null ? 'Comprobando...' : isConnected ? 'Servidor OK' : 'Sin servidor'}
          </span>
        </div>
        {!hasApiKey && (
          <div className="sidebar-status" style={{ marginTop: '6px', borderColor: 'rgba(245,158,11,0.3)' }}>
            <span className="status-dot" style={{ background: 'var(--warning)' }} />
            <span style={{ fontSize: '11px', color: 'var(--warning)' }}>Sin API key</span>
          </div>
        )}
      </div>
    </nav>
  )
}
