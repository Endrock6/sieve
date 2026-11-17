// Pure alias logic. No chrome.* calls live here so it can be imported by tests.
import { MULTI_SUFFIXES, WILD_SUFFIXES, EXCEPTION_SUFFIXES } from './psl.js'

export const TOKEN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const TOKEN_LENGTH = 6
export const MAX_SLUG_LENGTH = 24
export const FALLBACK_SLUG = 'site'
export const LOG_CAP = 200
export const EXPORT_COLUMNS = ['alias', 'slug', 'sourceHost', 'targetDomain', 'generatedAt']

let _multi, _wild, _except
function psl() {
  if (!_multi) {
    _multi = new Set(MULTI_SUFFIXES ? MULTI_SUFFIXES.split(' ') : [])
    _wild = new Set(WILD_SUFFIXES ? WILD_SUFFIXES.split(' ') : [])
    _except = new Set(EXCEPTION_SUFFIXES ? EXCEPTION_SUFFIXES.split(' ') : [])
  }
  return { multi: _multi, wild: _wild, except: _except }
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/

export function isIpAddress(host) {
  if (!host) return false
  if (IPV4.test(host)) return true
  // Bare IPv6 as returned by URL#hostname is bracketed.
  return host.startsWith('[') || (host.includes(':') && /^[0-9a-f:.]+$/i.test(host))
}

// Returns the registrable domain (eTLD+1) for a hostname, or null when the
// hostname has none (localhost, an IP, or a public suffix itself).
export function registrableDomain(host) {
  if (typeof host !== 'string') return null
  const h = host.toLowerCase().replace(/\.$/, '')
  if (!h || isIpAddress(h)) return null

  const labels = h.split('.')
  if (labels.length < 2) return null

  const { multi, wild, except } = psl()
  let suffixLabels = 1 // default rule: "*"

  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.')

    // Exception rules win outright: "!foo.bar" makes "bar" the suffix.
    if (except.has(candidate)) {
      suffixLabels = labels.length - i - 1
      break
    }
    if (multi.has(candidate)) {
      suffixLabels = labels.length - i
      break
    }
    const parent = labels.slice(i + 1).join('.')
    if (parent && wild.has(parent)) {
      suffixLabels = labels.length - i
      break
    }
  }

  if (labels.length <= suffixLabels) return null
  return labels.slice(labels.length - suffixLabels - 1).join('.')
}

export function sanitiseSlug(label) {
  if (!label) return FALLBACK_SLUG
  let s = String(label).toLowerCase()
  s = s.replace(/xn--/g, '')
  s = s.replace(/[^a-z0-9]+/g, '-')
  s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  if (s.length > MAX_SLUG_LENGTH) s = s.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '')
  return s || FALLBACK_SLUG
}

// Resolves the site a URL belongs to.
export function slugFromUrl(url) {
  let parsed
  try {
    parsed = new URL(String(url))
  } catch {
    return { slug: FALLBACK_SLUG, host: null, fallback: true }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { slug: FALLBACK_SLUG, host: parsed.hostname || null, fallback: true }
  }

  const host = parsed.hostname
  const reg = registrableDomain(host)
  if (!reg) return { slug: FALLBACK_SLUG, host: host || null, fallback: true }

  return { slug: sanitiseSlug(reg.split('.')[0]), host, fallback: false }
}

export function generateToken(length = TOKEN_LENGTH) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length]
  return out
}

export function buildAlias(slug, token, domain) {
  return `${slug}.${token}@${domain}`
}

export function validateDomain(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'Enter a domain' }
  const value = input.trim().toLowerCase()
  if (!value) return { ok: false, reason: 'Enter a domain' }
  if (value.includes('://')) return { ok: false, reason: 'Leave out the scheme — just the domain, e.g. example.com' }
  if (/[\s@/\\]/.test(value)) return { ok: false, reason: 'No spaces, @ or slashes' }
  if (!/^[a-z0-9.-]+$/.test(value)) return { ok: false, reason: 'Only letters, numbers, dots and hyphens' }
  if (!value.includes('.')) return { ok: false, reason: 'Needs at least one dot, e.g. example.com' }

  const labels = value.split('.')
  if (labels.some((l) => !l || l.length > 63 || l.startsWith('-') || l.endsWith('-'))) {
    return { ok: false, reason: 'Check the dots and hyphens' }
  }
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) {
    return { ok: false, reason: 'The last part must be letters, e.g. .com or .dev' }
  }
  return { ok: true, value }
}

export function pushLog(log, entry, cap = LOG_CAP) {
  const list = Array.isArray(log) ? log : []
  return [entry, ...list].slice(0, cap)
}

function csvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(entries) {
  const rows = [EXPORT_COLUMNS.join(',')]
  for (const entry of entries || []) {
    rows.push(EXPORT_COLUMNS.map((c) => csvCell(entry[c])).join(','))
  }
  return rows.join('\r\n') + '\r\n'
}

export function toJsonExport(entries, exportedAt = new Date().toISOString()) {
  return JSON.stringify({ exportedAt, version: 1, entries: entries || [] }, null, 2)
}
