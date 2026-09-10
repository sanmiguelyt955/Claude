import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'

// Next re-exports its own webpack; taking the type from the `webpack` config
// hook's parameter avoids adding a direct dependency on the `webpack` package.
type WebpackConfig = Parameters<NonNullable<NextConfig['webpack']>>[0]

const config: NextConfig = {
  // better-sqlite3 and sqlite-vec ship native .node binaries; Next's bundler
  // must leave them alone or the server build fails at require time.
  serverExternalPackages: ['better-sqlite3', 'sqlite-vec'],
  // The workspace root, so Next traces files across packages/ correctly.
  // fileURLToPath (not raw .pathname) decodes spaces — this repo lives under
  // "...\Apps de Claude\...".
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  experimental: {
    // Uploads go straight to disk, but server actions still need headroom.
    serverActions: { bodySizeLimit: '512mb' },
  },
  webpack(webpackConfig: WebpackConfig) {
    // The workspace packages are written with moduleResolution: NodeNext,
    // which requires relative imports to end in `.js` even though the file
    // on disk is `.ts` (tsx and Node's own ESM loader resolve that; the
    // Next/webpack resolver does not, unless told to try `.ts`/`.tsx` first).
    webpackConfig.resolve ??= {}
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    }
    return webpackConfig
  },
}

export default config
