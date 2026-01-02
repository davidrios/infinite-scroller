import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  server: {
    port: 5183
  },
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js'
    }
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'InfiniteScroller',
      fileName: 'infinite-scroller',
    },
    rollupOptions: {
      // Ensure specific external libraries are not bundled
      // if necessary. For a standalone component, usually minimal.
      external: [],
      output: {
        globals: {},
      },
    },
  },
  plugins: [dts({ rollupTypes: true })],
})
