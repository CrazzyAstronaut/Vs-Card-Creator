import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'
import ChatCreate from './components/ChatCreate.jsx'
import CardPreview from './components/CardPreview.jsx'
import PresetManager from './components/PresetManager.jsx'
import ImagePresetManager from './components/ImagePresetManager.jsx'
import MultiCharacterCreate from './components/MultiCharacterCreate.jsx'
import Settings from './components/Settings.jsx'
import { useLocalStorage } from './hooks/useLocalStorage.js'
import { DEFAULT_SETTINGS } from './utils/cardSchema.js'
import { DEFAULT_PRESETS } from './utils/defaultPresets.js'
import { DEFAULT_IMAGE_PRESETS } from './utils/defaultImagePresets.js'

export default function App() {
  const [settings, setSettings] = useLocalStorage('vcc_settings', DEFAULT_SETTINGS)
  const [cards, setCards] = useLocalStorage('vcc_cards', [])
  const [presets, setPresets] = useLocalStorage('vcc_presets', DEFAULT_PRESETS)
  const [imagePresets, setImagePresets] = useLocalStorage('vcc_image_presets', DEFAULT_IMAGE_PRESETS)

  const [menuOpen, setMenuOpen] = useState(false)

  const sharedProps = { settings, setSettings, cards, setCards, presets, setPresets, imagePresets, setImagePresets }

  return (
    <BrowserRouter>
      <div className="app-container">
        <button className="mobile-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />}
        <Sidebar settings={settings} open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard {...sharedProps} />} />
            <Route path="/create" element={<ChatCreate {...sharedProps} />} />
            <Route path="/multi" element={<MultiCharacterCreate {...sharedProps} />} />
            <Route path="/card/:id" element={<CardPreview {...sharedProps} />} />
            <Route path="/presets" element={<PresetManager {...sharedProps} />} />
            <Route path="/image-presets" element={<ImagePresetManager {...sharedProps} />} />
            <Route path="/settings" element={<Settings {...sharedProps} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
