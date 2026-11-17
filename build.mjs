#!/usr/bin/env bun
/**
 * Assembles distributable builds from the single source in this folder.
 *
 *   dist/chrome    manifest as-is (Chromium)
 *   dist/firefox   manifest + browser_specific_settings for Gecko
 *   dist/amo       signing zip and updates.json for unlisted self-distribution
 */
import { rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = import.meta.dirname ?? process.cwd()
const DIST = join(ROOT, 'dist')

// Where the unlisted .xpi and updates.json will live. Change this if you host
// them elsewhere; Firefox silently skips the check when it is unreachable.
const UPDATE_URL = 'https://sieve.endrock.dev/updates.json'
const GECKO_ID = 'sieve@endrock.dev'
const MIN_FIREFOX = '128.0'

// Only what an extension needs. Dev files stay out so the AMO zip is clean.
const FILES = [
  'popup.html',
  'popup.css',
  'popup.js',
  'options.html',
  'options.css',
  'options.js',
  'LICENSE',
]
const DIRS = ['lib', 'icons']

const base = JSON.parse(await readFile(join(ROOT, 'manifest.json'), 'utf8'))
const version = base.version

const firefoxManifest = {
  ...base,
  browser_specific_settings: {
    gecko: {
      id: GECKO_ID,
      strict_min_version: MIN_FIREFOX,
      update_url: UPDATE_URL,
      data_collection_permissions: { required: ['none'] },
    },
  },
}

async function emit(target, manifest) {
  const out = join(DIST, target)
  await mkdir(out, { recursive: true })

  for (const file of FILES) await cp(join(ROOT, file), join(out, file))
  for (const dir of DIRS) await cp(join(ROOT, dir), join(out, dir), { recursive: true })

  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return out
}

await rm(DIST, { recursive: true, force: true })

const chromeDir = await emit('chrome', base)
const firefoxDir = await emit('firefox', firefoxManifest)

const amoDir = join(DIST, 'amo')
await mkdir(amoDir, { recursive: true })

const zipName = `sieve-firefox-${version}.zip`
const zipPath = join(amoDir, zipName)
// Zip with a real writer: Compress-Archive emits backslash entry names on
// Windows PowerShell 5.1, which AMO rejects.
execFileSync(
  'powershell',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    join(ROOT, 'scripts', 'make-zip.ps1'),
    '-Source',
    firefoxDir,
    '-Destination',
    zipPath,
  ],
  { stdio: 'inherit' },
)

const updates = {
  addons: {
    [GECKO_ID]: {
      updates: [
        {
          version,
          update_link: UPDATE_URL.replace('updates.json', `sieve-firefox-${version}.xpi`),
        },
      ],
    },
  },
}
await writeFile(join(amoDir, 'updates.json'), JSON.stringify(updates, null, 2) + '\n')

const { statSync } = await import('node:fs')
const kb = (path) => `${(statSync(path).size / 1024).toFixed(1)} KB`

console.log('')
console.log(`Sieve ${version}`)
console.log(`  dist/chrome   ${chromeDir}`)
console.log(`  dist/firefox  ${firefoxDir}`)
console.log(`  dist/amo      ${zipName}  ${kb(zipPath)}`)
console.log('')
console.log('Upload the zip to addons.mozilla.org with the "unlisted" channel.')
console.log('It will return a signed .xpi to host alongside updates.json.')
