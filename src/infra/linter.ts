import { execSync } from 'node:child_process'

export function runEslintOnFiles(configPath: string, files: readonly string[]): boolean {
  const fileList = files.map((f) => `"${f}"`).join(' ')
  try {
    execSync(`npx eslint --config "${configPath}" ${fileList}`, {
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    return true
  } catch {
    return false
  }
}
