import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Default Vite proxy timeout is 120s — PaddleOCR (first run loads models) often exceeds that → 502.
const API_PROXY_MS = 300_000 // 5 min (large uploads / slow API)
const PDF_PROXY_MS = 600_000 // 10 min (model download + OCR)

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd(), '')
  
  const apiTarget = env.VITE_API_URL || ''
  // Proxy runs in Node (Vite). Use VITE_PDF_SERVICE_PROXY_TARGET when 127.0.0.1 fails (e.g. devcontainer → host Docker: http://host.docker.internal:8001).
  const rawPdf =
    env.VITE_PDF_SERVICE_PROXY_TARGET || env.VITE_PDF_SERVICE_URL || ''
  const pdfServiceTarget = rawPdf.replace(
    /^http:\/\/0\.0\.0\.0(?::(\d+))?/,
    (_, port) => `http://127.0.0.1${port ? `:${port}` : ''}`
  )

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Listen on all interfaces so localhost / 127.0.0.1 both reach the dev server.
      host: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          timeout: API_PROXY_MS,
          proxyTimeout: API_PROXY_MS,
        },
        ...(pdfServiceTarget
          ? {
              '/pdf-service': {
                target: pdfServiceTarget,
                changeOrigin: true,
                timeout: PDF_PROXY_MS,
                proxyTimeout: PDF_PROXY_MS,
                rewrite: (path: string) => path.replace(/^\/pdf-service/, ''),
                configure: (proxy) => {
                  proxy.on('proxyReq', (proxyReq) => {
                    proxyReq.setTimeout(PDF_PROXY_MS)
                  })
                  proxy.on('proxyRes', (proxyRes) => {
                    proxyRes.setTimeout(PDF_PROXY_MS)
                  })
                  proxy.on('error', (err) => {
                    const code = (err as NodeJS.ErrnoException).code
                    if (code === 'ECONNREFUSED') {
                      console.error(
                        `[vite] pdf-service proxy: cannot reach ${pdfServiceTarget} (ECONNREFUSED). ` +
                          'On the host, run: curl -sS http://127.0.0.1:8001/health. ' +
                          'Start PDF with: cd pdf_service && docker compose up -d. ' +
                          'If Vite runs inside a devcontainer, set VITE_PDF_SERVICE_PROXY_TARGET=http://host.docker.internal:8001 in .env.'
                      )
                    }
                  })
                },
              },
            }
          : {}),
      },
    },
  }
})
