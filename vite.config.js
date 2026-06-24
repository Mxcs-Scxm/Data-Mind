import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    console.warn(
      '\n⚠️  ANTHROPIC_API_KEY is missing or still a placeholder in .env — ' +
      'every Claude call will fail with a 401 "x-api-key header is required" error.\n' +
      '   Set a real key in .env, then restart the dev server (npm run dev).\n'
    )
  }
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-api-key', env.ANTHROPIC_API_KEY || '')
              proxyReq.setHeader('anthropic-version', '2023-06-01')
            })
          },
        },
        // Keeps the NewsAPI key out of the browser/URL: the client sends its
        // key (entered in the Connectors UI) via the X-Api-Key header, which
        // is swapped server-side for an env-configured key when present.
        '/api/newsapi': {
          target: 'https://newsapi.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/newsapi/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const clientKey = req.headers['x-api-key']
              proxyReq.setHeader('X-Api-Key', env.NEWSAPI_API_KEY || clientKey || '')
            })
          },
        },
      },
    },
  }
})
