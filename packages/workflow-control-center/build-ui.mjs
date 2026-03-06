import { build, context } from 'esbuild'
import { readFile, writeFile, cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const outDir = 'dist/ui'
const srcDir = 'src/ui'
const watch = process.argv.includes('--watch')

async function buildCss() {
  const files = ['tokens.css', 'layout.css', 'components.css']
  const parts = await Promise.all(
    files.map((f) => readFile(join(srcDir, 'styles', f), 'utf8')),
  )
  await mkdir(join(outDir), { recursive: true })
  await writeFile(join(outDir, 'styles.css'), parts.join('\n'))
}

async function buildHtml() {
  await mkdir(outDir, { recursive: true })
  await cp(join(srcDir, 'index.html'), join(outDir, 'index.html'))
}

const esbuildOptions = {
  entryPoints: [join(srcDir, 'scripts/app.ts')],
  bundle: true,
  outfile: join(outDir, 'app.js'),
  format: 'esm',
  target: 'es2022',
  minify: !watch,
  sourcemap: watch,
}

async function runBuild() {
  await Promise.all([buildCss(), buildHtml()])

  if (watch) {
    const ctx = await context(esbuildOptions)
    await ctx.watch()
    console.log('Watching for changes...')
  } else {
    await build(esbuildOptions)
    console.log('UI built to dist/ui/')
  }
}

runBuild().catch((err) => {
  console.error(err)
  process.exit(1)
})
