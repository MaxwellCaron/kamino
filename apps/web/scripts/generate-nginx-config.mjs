import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { dirname } from "node:path"

const [shellPath, templatePath, outputPath] = process.argv.slice(2)

if (!shellPath || !templatePath || !outputPath) {
  throw new Error(
    "Usage: generate-nginx-config.mjs <shell.html> <template.conf> <output.conf>"
  )
}

const [shell, template] = await Promise.all([
  readFile(shellPath, "utf8"),
  readFile(templatePath, "utf8"),
])

const inlineScripts = [
  ...shell.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
]
  .filter(([, attributes, script]) => {
    return !/\bsrc\s*=/i.test(attributes) && script.length > 0
  })
  .map(([, , script]) => script)

if (inlineScripts.length === 0) {
  throw new Error(`No inline scripts found in ${shellPath}`)
}

const hashes = [
  ...new Set(
    inlineScripts.map((script) => {
      const digest = createHash("sha256").update(script).digest("base64")
      return `'sha256-${digest}'`
    })
  ),
]

const scriptDirective = "script-src 'self';"
const occurrences = template.split(scriptDirective).length - 1

if (occurrences !== 1) {
  throw new Error(
    `Expected exactly one ${JSON.stringify(scriptDirective)} directive in ${templatePath}, found ${occurrences}`
  )
}

const config = template.replace(
  scriptDirective,
  `script-src 'self' ${hashes.join(" ")};`
)

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, config)

console.log(`Added ${hashes.length} inline script hashes to ${outputPath}`)
