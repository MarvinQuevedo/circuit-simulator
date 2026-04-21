import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/store/**', 'src/hooks/**'],
      exclude: ['src/core/models/**/*.jsx'], // SVG-heavy models — cover in integration tests
    },
  },
})
