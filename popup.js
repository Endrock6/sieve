import { slugFromUrl, generateToken, buildAlias, pushLog, LOG_CAP } from './lib/alias.js'

const $ = (id) => document.getElementById(id)

const output = $('output')
const copyButton = $('copy')
const provenance = $('provenance')
const notice = $('notice')
const flash = $('flash')
const generateButton = $('generate')
const optionsButton = $('open-options')

let currentAlias = null
let flashTimer = null

function setFlash(text) {
  flash.textContent = text
  flash.hidden = false
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flash.hidden = true
  }, 1200)
}

function render(entry) {
  currentAlias = entry.alias
  output.value = entry.alias
  copyButton.disabled = false

  provenance.hidden = false
  if (entry.usedFallback) {
    provenance.textContent = 'no site detected — used "site"'
    provenance.classList.add('warn')
  } else {
    provenance.textContent = `generated for ${entry.sourceHost || 'this page'}`
    provenance.classList.remove('warn')
  }
}

async function copyAlias() {
  if (!currentAlias) return false

  try {
    await navigator.clipboard.writeText(currentAlias)
    return true
  } catch {
    // Async clipboard can be unavailable; fall back to a hidden textarea.
    try {
      const scratch = document.createElement('textarea')
      scratch.value = currentAlias
      scratch.style.position = 'fixed'
      scratch.style.opacity = '0'
      document.body.appendChild(scratch)
      scratch.select()
      const ok = document.execCommand('copy')
      scratch.remove()
      return ok
    } catch {
      return false
    }
  }
}

function showNotice(text) {
  notice.hidden = false
  notice.textContent = `${text} `

  const link = document.createElement('a')
  link.href = '#'
  link.textContent = 'Open options'
  link.addEventListener('click', (event) => {
    event.preventDefault()
    chrome.runtime.openOptionsPage()
  })

  notice.append(link)
}

function clearNotice() {
  notice.hidden = true
  notice.textContent = ''
}

async function generate() {
  clearNotice()

  const { targetDomain } = await chrome.storage.local.get('targetDomain')
  if (!targetDomain) {
    showNotice('Set a domain first.')
    return
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tabs && tabs[0] ? tabs[0].url : ''
  const { slug, host, fallback } = slugFromUrl(url)

  const entry = {
    alias: buildAlias(slug, generateToken(), targetDomain),
    slug,
    sourceHost: host || '',
    targetDomain,
    generatedAt: new Date().toISOString(),
    usedFallback: fallback,
  }

  const { log } = await chrome.storage.local.get('log')
  await chrome.storage.local.set({
    lastAlias: entry,
    log: pushLog(log, entry, LOG_CAP),
  })

  render(entry)

  const copied = await copyAlias()
  setFlash(copied ? 'Copied' : 'Copy failed — select and copy manually')
}

async function init() {
  const { lastAlias } = await chrome.storage.local.get('lastAlias')
  if (lastAlias && lastAlias.alias) render(lastAlias)

  generateButton.addEventListener('click', generate)

  copyButton.addEventListener('click', async () => {
    const copied = await copyAlias()
    setFlash(copied ? 'Copied' : 'Copy failed')
  })

  optionsButton.addEventListener('click', () => chrome.runtime.openOptionsPage())

  output.addEventListener('click', () => output.select())

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    if (event.target === optionsButton) return
    event.preventDefault()
    generate()
  })
}

init()
