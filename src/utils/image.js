// Convierte un archivo de imagen en un data URL redimensionado (para avatares).
// Redimensiona a un máximo razonable para no inflar el almacenamiento.
export function fileToResizedDataURL(file, maxSize = 256, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('El archivo no es una imagen'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize }
        } else {
          if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        try {
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch (e) {
          reject(e)
        }
      }
      img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}
