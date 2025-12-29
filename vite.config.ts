import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
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
