import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Charge les variables d'environnement
  const env = loadEnv(mode, process.cwd(), '')

  // Vérification des clés API
  if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    console.warn(
      '\n⚠️  ANTHROPIC_API_KEY is missing or still a placeholder in .env — ' +
      'every Claude call will fail with a 401 "x-api-key header is required" error.\n' +
      '   Set a real key in .env, then restart the dev server (npm run dev).\n'
    )
  }
  if (!env.MISTRAL_API_KEY || env.MISTRAL_API_KEY === 'your_mistral_api_key_here') {
    console.warn(
      '\n⚠️  MISTRAL_API_KEY is missing or still a placeholder in .env — ' +
      'every Mistral call will fail with a 404 error.\n' +
      '   Set a real key in .env, then restart the dev server (npm run dev).\n'
    )
  }

  return {
    plugins: [react()],
    server: {
      // Port par défaut de Vite (5173)
      port: 5173,
      proxy: {
        // Proxy existant pour Anthropic (à garder)
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
        // Proxy existant pour NewsAPI (à garder)
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
        // ✅✅✅ NOUVEAU PROXY POUR MISTRAL (À AJOUTER)
        '/api/mistral': {
          target: 'https://api.mistral.ai',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mistral/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Ajoute le token Bearer dans l'en-tête Authorization
              proxyReq.setHeader('Authorization', `Bearer ${env.MISTRAL_API_KEY || ''}`)
            })
          },
        },
      },
    },
  }
})
