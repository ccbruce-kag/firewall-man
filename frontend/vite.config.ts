import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = 'http://localhost:10002'
const proxyToBackend = { target: backend, changeOrigin: true }
const wsProxyToBackend = { target: backend, changeOrigin: true, ws: true }

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    proxy: {
      '/api/': proxyToBackend,
      '/miitai-fwm/': proxyToBackend,
      '/listRule': proxyToBackend,
      '/listExec': proxyToBackend,
      '/flushRule': proxyToBackend,
      '/deleteRule': proxyToBackend,
      '/flushMetrics': proxyToBackend,
      '/getRuleInfo': proxyToBackend,
      '/flushEmptyCustomChain': proxyToBackend,
      '/export': proxyToBackend,
      '/import': proxyToBackend,
      '/exec': proxyToBackend,
      '/platform': proxyToBackend,
      '/version': proxyToBackend,
      '/health': proxyToBackend,
      '/activity': proxyToBackend,
      '/interfaces': proxyToBackend,
      '/log': proxyToBackend,
      '/docs/': proxyToBackend,
      '/system/': proxyToBackend,
      '/juniper/': proxyToBackend,
      '/haproxy/': proxyToBackend,
      '/nginx/': proxyToBackend,
      '/netplan/': proxyToBackend,
      '/apiman/': proxyToBackend,
      '/dbman/': proxyToBackend,
      '/security/': proxyToBackend,
      '/tools/': proxyToBackend,
      '/erd-diagrams/': proxyToBackend,
      '/workflows/': proxyToBackend,
      '/network-architectures/': proxyToBackend,
      '/settings/': proxyToBackend,
      '/shell': wsProxyToBackend,
      '/ai': wsProxyToBackend,
      '/ai/': wsProxyToBackend,
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  css: {
    lightningcss: {
      errorRecovery: true,
    },
  },
})
