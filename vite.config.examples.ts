import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'url'

const dir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the dev-server alias so /src/... imports work in examples
      '/src': `${dir}src`,
    },
  },
  build: {
    outDir: 'dist-examples',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: `${dir}index.html`,
        vanilla1: `${dir}examples/vanilla1/index.html`,
        vanilla2: `${dir}examples/vanilla2/index.html`,
      },
    },
  },
})
