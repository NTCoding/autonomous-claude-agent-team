import { execSync } from 'node:child_process'

export function getRepositoryName(cwd: string): string | undefined {
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf-8', cwd }).trim()
    const httpsMatch = url.match(/github\.com\/([^/]+\/[^/.]+?)(?:\.git)?$/)
    if (httpsMatch?.[1] !== undefined) return httpsMatch[1]
    const sshMatch = url.match(/github\.com:([^/]+\/[^/.]+?)(?:\.git)?$/)
    if (sshMatch?.[1] !== undefined) return sshMatch[1]
    return undefined
  } catch {
    return undefined
  }
}
