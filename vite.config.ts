import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serve the serverless handlers in /api during `vite dev` and `vite preview`, so the
 * Ask feature can be exercised locally exactly as it runs when deployed.
 */
function localApi(): Plugin {
  const mount = (server: { middlewares: any; ssrLoadModule?: (id: string) => Promise<any> }) => {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (!req.url?.startsWith('/api/')) return next()
      const name = req.url.split('?')[0].replace('/api/', '').replace(/[^a-z0-9-]/gi, '')
      try {
        const mod = server.ssrLoadModule ? await server.ssrLoadModule(`/api/${name}.ts`) : await import(/* @vite-ignore */ `${process.cwd()}/api/${name}.ts`)
        const handler = mod[req.method as string] || mod.default
        if (!handler) { res.statusCode = 405; return res.end('Method not allowed') }
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c)
        const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        })
        const response: Response = await handler(request)
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        if (!response.body) return res.end()
        const reader = response.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      } catch (err) {
        res.statusCode = 500
        res.end(String(err))
      }
    })
  }
  return { name: 'local-api', configureServer: mount as any, configurePreviewServer: mount as any }
}

// `VITE_TARGET=artifact` builds a copy that runs from any folder (relative URLs, hash routing),
// which is what a hosted Claude artifact needs. The default build is the normal website.
const artifact = process.env.VITE_TARGET === 'artifact'

export default defineConfig({
  plugins: [react(), localApi()],
  base: artifact ? './' : '/',
  build: {
    outDir: artifact ? 'dist-artifact' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three'
          if (id.includes('@react-three') || id.includes('postprocessing') || id.includes('camera-controls') || id.includes('three-stdlib') || id.includes('maath')) return 'r3f'
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
})
