import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En GitHub Pages la app vive en /<nombre-del-repo>/, por eso el base.
// Para correr local o en otro hosting, VITE_BASE=/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/nuestras-metas/',
})
