import { test, expect, describe } from 'bun:test'
import {
  registrableDomain,
  slugFromUrl,
  sanitiseSlug,
  generateToken,
  buildAlias,
  validateDomain,
  pushLog,
  toCsv,
  toJsonExport,
  TOKEN_ALPHABET,
  TOKEN_LENGTH,
  LOG_CAP,
} from '../lib/alias.js'

describe('registrableDomain', () => {
  test('simple gTLD', () => {
    expect(registrableDomain('netflix.com')).toBe('netflix.com')
  })

  test('strips subdomains', () => {
    expect(registrableDomain('accounts.google.com')).toBe('google.com')
    expect(registrableDomain('a.b.c.netflix.com')).toBe('netflix.com')
  })

  test('multi-label suffixes (.com.au)', () => {
    expect(registrableDomain('shop.example.com.au')).toBe('example.com.au')
    expect(registrableDomain('example.com.au')).toBe('example.com.au')
  })

  test('multi-label suffixes (.co.uk)', () => {
    expect(registrableDomain('www.bbc.co.uk')).toBe('bbc.co.uk')
  })

  test('wildcard rule (*.ck)', () => {
    expect(registrableDomain('foo.bar.ck')).toBe('foo.bar.ck')
  })

  test('exception rule (!www.ck)', () => {
    expect(registrableDomain('www.ck')).toBe('www.ck')
  })

  test('single-label suffix falls back to last two labels', () => {
    expect(registrableDomain('example.museum')).toBe('example.museum')
  })

  test('null for hosts with no registrable domain', () => {
    expect(registrableDomain('localhost')).toBeNull()
    expect(registrableDomain('192.168.1.5')).toBeNull()
    expect(registrableDomain('com')).toBeNull()
    expect(registrableDomain('')).toBeNull()
    expect(registrableDomain('example.co.uk.')).toBe('example.co.uk')
  })
})

describe('sanitiseSlug', () => {
  test('lowercases', () => {
    expect(sanitiseSlug('Netflix')).toBe('netflix')
  })

  test('strips punycode prefix', () => {
    expect(sanitiseSlug('xn--bcher-kva')).toBe('bcher-kva')
  })

  test('replaces disallowed characters and collapses runs', () => {
    expect(sanitiseSlug('home__depot!!')).toBe('home-depot')
    expect(sanitiseSlug('--a---b--')).toBe('a-b')
  })

  test('truncates to 24 chars and trims a trailing hyphen', () => {
    expect(sanitiseSlug('a'.repeat(40))).toHaveLength(24)
    expect(sanitiseSlug('a'.repeat(23) + '-b')).toBe('a'.repeat(23))
  })

  test('never contains a dot', () => {
    expect(sanitiseSlug('example.com')).not.toContain('.')
  })

  test('empty input falls back to site', () => {
    expect(sanitiseSlug('')).toBe('site')
    expect(sanitiseSlug('!!!')).toBe('site')
  })
})

describe('slugFromUrl', () => {
  test('plain https site', () => {
    expect(slugFromUrl('https://www.netflix.com/browse')).toEqual({
      slug: 'netflix',
      host: 'www.netflix.com',
      fallback: false,
    })
  })

  test('drops www and subdomains', () => {
    expect(slugFromUrl('https://accounts.google.com/signin').slug).toBe('google')
  })

  test('australian domain', () => {
    expect(slugFromUrl('https://shop.example.com.au/checkout').slug).toBe('example')
  })

  test('IDN host becomes readable slug', () => {
    expect(slugFromUrl('https://bücher.de/').slug).toBe('bcher-kva')
  })

  test('uppercase host is normalised', () => {
    expect(slugFromUrl('HTTPS://NETFLIX.COM/').slug).toBe('netflix')
  })

  test('chrome:// falls back', () => {
    expect(slugFromUrl('chrome://extensions')).toMatchObject({ slug: 'site', fallback: true })
  })

  test('file://, localhost, bare IP fall back', () => {
    expect(slugFromUrl('file:///C:/x.txt').fallback).toBe(true)
    expect(slugFromUrl('http://localhost:3000/app')).toMatchObject({ slug: 'site', fallback: true })
    expect(slugFromUrl('http://192.168.1.5/admin')).toMatchObject({ slug: 'site', fallback: true })
  })

  test('garbage and empty input fall back', () => {
    expect(slugFromUrl('').fallback).toBe(true)
    expect(slugFromUrl('not a url').fallback).toBe(true)
  })
})

describe('generateToken', () => {
  test('length and alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const token = generateToken()
      expect(token).toHaveLength(TOKEN_LENGTH)
      for (const char of token) expect(TOKEN_ALPHABET).toContain(char)
    }
  })

  test('does not contain ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateToken()).not.toMatch(/[0o1li]/)
    }
  })

  test('is not constant', () => {
    const seen = new Set()
    for (let i = 0; i < 50; i++) seen.add(generateToken())
    expect(seen.size).toBeGreaterThan(40)
  })

  test('respects a custom length', () => {
    expect(generateToken(10)).toHaveLength(10)
  })
})

describe('buildAlias', () => {
  test('composes the agreed format', () => {
    expect(buildAlias('netflix', 'k3m7p2', 'endrock.dev')).toBe('netflix.k3m7p2@endrock.dev')
  })
})

describe('validateDomain', () => {
  const accepted = ['endrock.dev', 'example.com', 'mail.endrock.dev', 'sub.example.co.uk', 'A.COM']
  for (const value of accepted) {
    test(`accepts ${value}`, () => {
      const result = validateDomain(value)
      expect(result.ok).toBe(true)
      expect(result.value).toBe(value.trim().toLowerCase())
    })
  }

  test('rejects empty, scheme, path and @', () => {
    for (const value of ['', '   ', 'https://endrock.dev', 'endrock.dev/path', 'me@endrock.dev', 'endrock']) {
      expect(validateDomain(value).ok).toBe(false)
    }
  })

  test('rejects a numeric or single-letter TLD', () => {
    expect(validateDomain('example.1com').ok).toBe(false)
    expect(validateDomain('example.c').ok).toBe(false)
  })

  test('rejects malformed labels', () => {
    expect(validateDomain('exa mple.com').ok).toBe(false)
    expect(validateDomain('example..com').ok).toBe(false)
    expect(validateDomain('-example.com').ok).toBe(false)
    expect(validateDomain('example-.com').ok).toBe(false)
  })

  test('rejects non-string input', () => {
    expect(validateDomain(undefined).ok).toBe(false)
  })

  test('trims surrounding whitespace', () => {
    expect(validateDomain('  endrock.dev  ')).toEqual({ ok: true, value: 'endrock.dev' })
  })
})

describe('pushLog', () => {
  const entry = (n) => ({ alias: `site.tok${n}@example.com`, generatedAt: `2026-01-01T00:00:0${n}Z` })

  test('prepends newest first', () => {
    const log = pushLog([entry(1)], entry(2))
    expect(log[0]).toEqual(entry(2))
    expect(log[1]).toEqual(entry(1))
  })

  test(`caps at ${LOG_CAP} entries, dropping the oldest`, () => {
    let log = []
    for (let i = 0; i < LOG_CAP + 25; i++) log = pushLog(log, entry(i))
    expect(log).toHaveLength(LOG_CAP)
    expect(log[0]).toEqual(entry(LOG_CAP + 24))
    expect(log.at(-1)).toEqual(entry(25))
  })

  test('tolerates a missing or invalid log', () => {
    expect(pushLog(undefined, entry(1))).toHaveLength(1)
    expect(pushLog(null, entry(1))).toHaveLength(1)
  })
})

describe('exports', () => {
  const entries = [
    {
      alias: 'netflix.k3m7p2@endrock.dev',
      slug: 'netflix',
      sourceHost: 'www.netflix.com',
      targetDomain: 'endrock.dev',
      generatedAt: '2026-11-17T07:20:52.000Z',
    },
  ]

  test('csv has the agreed header', () => {
    expect(toCsv(entries).split('\r\n')[0]).toBe('alias,slug,sourceHost,targetDomain,generatedAt')
  })

  test('csv quotes values containing commas', () => {
    expect(toCsv([{ ...entries[0], sourceHost: 'a,b.com' }])).toContain('"a,b.com"')
  })

  test('csv quotes and escapes embedded quotes', () => {
    expect(toCsv([{ ...entries[0], sourceHost: 'say "hi"' }])).toContain('"say ""hi"""')
  })

  test('csv handles an empty log', () => {
    expect(toCsv([])).toBe('alias,slug,sourceHost,targetDomain,generatedAt\r\n')
  })

  test('json has the agreed shape', () => {
    const parsed = JSON.parse(toJsonExport(entries, '2026-11-17T08:00:00.000Z'))
    expect(parsed).toEqual({
      exportedAt: '2026-11-17T08:00:00.000Z',
      version: 1,
      entries,
    })
  })
})
