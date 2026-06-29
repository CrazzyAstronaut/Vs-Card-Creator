// Sonido "PING~!" de notificación al terminar una respuesta de la IA.
// Usa la Web Audio API para no depender de archivos de audio.
let ctx = null

export function playPing() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = ctx || new AC()
    if (ctx.state === 'suspended') ctx.resume()

    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)

    o.type = 'sine'
    o.frequency.setValueAtTime(880, t)        // A5
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.10) // sube tipo "ping~"

    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)

    o.start(t)
    o.stop(t + 0.47)
  } catch {
    // El navegador puede bloquear el audio hasta la primera interacción; se ignora.
  }
}
