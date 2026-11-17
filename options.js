import { validateDomain, toCsv, toJsonExport, LOG_CAP } from './lib/alias.js'

const $ = (id) => document.getElementById(id)

const form = $('domain-form')
const domainInput = $('domain')
const domainStatus = $('domain-status')
const logBody = $('log-body')
const logTable = $('log-table')
const logEmpty = $('log-empty')
const logCount = $('log-count')
const exportJsonButton = $('export-json')
const exportCsvButton = $('export-csv')
const clearButton = $('clear-log')

let entries = []
let statusTimer = null

function setStatus(text, kind) {
  domainStatus.hidden = !text
  domainStatus.textContent = text || ''
  domainStatus.className = 'status' + (kind ? ` ${kind}` : '')
}

function flashStatus(text, kind) {
  setStatus(text, kind)
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => setStatus(''), 2200)
}

function formatDate(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso || '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function cell(text, className) {
  const td = document.createElement('td')
  if (className) td.className = className
  td.textContent = text
  return td
}

function renderLog() {
  logBody.textContent = ''

  const hasEntries = entries.length > 0
  logTable.hidden = !hasEntries
  logEmpty.hidden = hasEntries
  exportJsonButton.disabled = !hasEntries
  exportCsvButton.disabled = !hasEntries
  clearButton.disabled = !hasEntries
  logCount.textContent = hasEntries ? `${entries.length} of ${LOG_CAP} stored, newest first` : ''

  for (const entry of entries) {
    const row = document.createElement('tr')
    row.append(
      cell(entry.alias, 'mono'),
      cell(entry.sourceHost || '—'),
      cell(entry.targetDomain || '—'),
      cell(formatDate(entry.generatedAt)),
    )
    logBody.append(row)
  }
}

function download(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportStamp() {
  return new Date().toISOString().slice(0, 10)
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()

  const result = validateDomain(domainInput.value)
  if (!result.ok) {
    setStatus(result.reason, 'error')
    domainInput.focus()
    return
  }

  await chrome.storage.local.set({ targetDomain: result.value })
  domainInput.value = result.value
  flashStatus(`Saved — aliases will use ${result.value}`, 'ok')
})

exportJsonButton.addEventListener('click', () => {
  download(`sieve-aliases-${exportStamp()}.json`, toJsonExport(entries), 'application/json')
})

exportCsvButton.addEventListener('click', () => {
  download(`sieve-aliases-${exportStamp()}.csv`, toCsv(entries), 'text/csv')
})

clearButton.addEventListener('click', async () => {
  if (!entries.length) return
  const ok = confirm(`Delete all ${entries.length} generated aliases? This cannot be undone.`)
  if (!ok) return

  await chrome.storage.local.set({ log: [] })
  entries = []
  renderLog()
  flashStatus('Log cleared', 'ok')
})

async function init() {
  const stored = await chrome.storage.local.get(['targetDomain', 'log'])
  if (stored.targetDomain) domainInput.value = stored.targetDomain
  entries = Array.isArray(stored.log) ? stored.log : []
  renderLog()
}

init()
