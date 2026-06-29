// Utilidades para fusionar datos locales con los del servidor (sincronización
// entre dispositivos). La fusión es "unión por id" para no perder datos: ante
// el mismo elemento, gana la versión con marca de tiempo más reciente.

function tsOf(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k]) {
      const t = new Date(obj[k]).getTime()
      if (!Number.isNaN(t)) return t
    }
  }
  return 0
}

export function mergeByKey(local = [], server = [], key = '_id', tsKeys = ['_updatedAt', '_createdAt']) {
  const map = new Map()
  for (const it of (Array.isArray(server) ? server : [])) {
    if (it && it[key] != null) map.set(it[key], it)
  }
  for (const it of (Array.isArray(local) ? local : [])) {
    if (!it || it[key] == null) continue
    const existing = map.get(it[key])
    if (!existing || tsOf(it, tsKeys) >= tsOf(existing, tsKeys)) map.set(it[key], it)
  }
  return Array.from(map.values())
}

// Para settings (objeto único): el servidor manda, pero nunca borramos una API
// key local con una vacía del servidor.
export function mergeSettings(local = {}, server = {}) {
  const merged = { ...local, ...server }
  if (!merged.apiKey && local.apiKey) merged.apiKey = local.apiKey
  return merged
}
