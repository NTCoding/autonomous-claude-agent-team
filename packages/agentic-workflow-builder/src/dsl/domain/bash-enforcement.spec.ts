import { checkBashCommand } from './bash-enforcement.js'
import type { BashForbiddenConfig } from './types.js'

const GIT_FORBIDDEN: BashForbiddenConfig = {
  patterns: [
    /(?:^|\s|&&|;)git\s+(?:commit|push)(?:\s|$|-|;|&)/,
    /(?:^|\s|&&|;)git\s+checkout(?:\s|$|-|;|&)/,
  ],
  flags: ['--no-verify', '--force'],
}

const PATTERNS_ONLY: BashForbiddenConfig = {
  patterns: [/(?:^|\s|&&|;)gh\s+pr(?:\s|$|-|;|&)/],
}

describe('checkBashCommand', () => {
  describe('pattern matching', () => {
    it('passes when command matches no forbidden pattern', () => {
      expect(checkBashCommand('npm test', GIT_FORBIDDEN, [])).toStrictEqual({ pass: true })
    })

    it('fails when command matches a forbidden pattern with no exemption', () => {
      const result = checkBashCommand('git commit -m "test"', GIT_FORBIDDEN, [])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toBe('Command matches forbidden bash pattern.')
      }
    })

    it('fails for git push with no exemption', () => {
      expect(checkBashCommand('git push origin main', GIT_FORBIDDEN, []).pass).toBe(false)
    })

    it('fails for git checkout with no exemption', () => {
      expect(checkBashCommand('git checkout main', GIT_FORBIDDEN, []).pass).toBe(false)
    })

    it('passes when command matches pattern but has matching exemption', () => {
      expect(checkBashCommand('git commit -m "test"', GIT_FORBIDDEN, ['git commit'])).toStrictEqual({ pass: true })
    })

    it('passes when exemption matches as substring of command', () => {
      expect(checkBashCommand('git push origin main', GIT_FORBIDDEN, ['git push'])).toStrictEqual({ pass: true })
    })

    it('fails when exemption does not match the forbidden command', () => {
      const result = checkBashCommand('git push origin main', GIT_FORBIDDEN, ['git commit'])
      expect(result.pass).toBe(false)
    })

    it('passes for git checkout when exempted', () => {
      expect(checkBashCommand('git checkout -b feature', GIT_FORBIDDEN, ['git checkout'])).toStrictEqual({ pass: true })
    })

    it('passes when one of multiple exemptions matches', () => {
      expect(checkBashCommand('git commit -m "x"', GIT_FORBIDDEN, ['git push', 'git commit'])).toStrictEqual({ pass: true })
    })
  })

  describe('pattern boundary matching', () => {
    it('matches git commit at start of command', () => {
      expect(checkBashCommand('git commit -m "x"', GIT_FORBIDDEN, []).pass).toBe(false)
    })

    it('matches git push after &&', () => {
      expect(checkBashCommand('npm test && git push', GIT_FORBIDDEN, []).pass).toBe(false)
    })

    it('matches git checkout after semicolon', () => {
      expect(checkBashCommand('echo ok; git checkout main', GIT_FORBIDDEN, []).pass).toBe(false)
    })

    it('does not match partial words like gitcommit', () => {
      expect(checkBashCommand('gitcommit', GIT_FORBIDDEN, [])).toStrictEqual({ pass: true })
    })
  })

  describe('flag enforcement', () => {
    it('fails when command contains a forbidden flag', () => {
      const result = checkBashCommand('git commit --no-verify -m "x"', GIT_FORBIDDEN, [])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toBe("Forbidden flag '--no-verify' in command.")
      }
    })

    it('fails for --force flag', () => {
      const result = checkBashCommand('git push --force', GIT_FORBIDDEN, [])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toBe("Forbidden flag '--force' in command.")
      }
    })

    it('blocks flags even when command has pattern exemption', () => {
      const result = checkBashCommand('git commit --no-verify -m "x"', GIT_FORBIDDEN, ['git commit'])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toBe("Forbidden flag '--no-verify' in command.")
      }
    })

    it('blocks flags in non-forbidden commands', () => {
      const result = checkBashCommand('npm install --force', GIT_FORBIDDEN, [])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toBe("Forbidden flag '--force' in command.")
      }
    })
  })

  describe('config without flags', () => {
    it('checks patterns only when flags not configured', () => {
      expect(checkBashCommand('gh pr create', PATTERNS_ONLY, []).pass).toBe(false)
    })

    it('passes non-matching commands', () => {
      expect(checkBashCommand('gh issue list', PATTERNS_ONLY, [])).toStrictEqual({ pass: true })
    })

    it('passes with exemption', () => {
      expect(checkBashCommand('gh pr checks', PATTERNS_ONLY, ['gh pr checks'])).toStrictEqual({ pass: true })
    })

    it('scoped exemption blocks broader command', () => {
      const result = checkBashCommand('gh pr create', PATTERNS_ONLY, ['gh pr checks'])
      expect(result.pass).toBe(false)
    })
  })

  describe('empty config', () => {
    it('passes any command with empty patterns', () => {
      expect(checkBashCommand('git commit -m "x"', { patterns: [] }, [])).toStrictEqual({ pass: true })
    })
  })

  describe('flag checked before patterns', () => {
    it('returns flag error even when pattern also matches', () => {
      const result = checkBashCommand('git commit --no-verify', GIT_FORBIDDEN, [])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toContain('--no-verify')
      }
    })
  })
})
