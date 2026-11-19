import { join, relative } from "node:path"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url))
const errors: Array<string> = []

function checkDirectory(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const location = relative(sourceRoot, path).replaceAll("\\", "/")

    if (entry.isDirectory()) {
      if (
        location === "features" ||
        /^(lib|hooks)\/(?:.*\/)?components$/.test(location)
      ) {
        errors.push(`${location}: UI belongs in src/components/<area>.`)
      }
      if (/^lib\/.+\/(api|utils|types)$/.test(location)) {
        errors.push(`${location}: keep category files directly in their lib area.`)
      }
      checkDirectory(path)
      continue
    }

    if (
      !/\.[jt]sx?$/.test(entry.name) ||
      /\.(test|spec)\.[jt]sx?$/.test(entry.name)
    )
      continue
    const area = location.split("/")[0]
    if (area !== "components" && area !== "lib") continue

    if (area === "components" && !entry.name.endsWith(".tsx")) {
      errors.push(
        `${location}: put helpers and contracts in lib, and hooks in hooks.`
      )
    }

    const file = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true
    )
    function checkNode(node: ts.Node) {
      if (
        (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        /^use[A-Z]/.test(node.name.text)
      ) {
        errors.push(
          `${location}: ${node.name.text} belongs in src/hooks/<area>.`
        )
      }
      if (
        area === "lib" &&
        (ts.isJsxElement(node) ||
          ts.isJsxSelfClosingElement(node) ||
          ts.isJsxFragment(node))
      ) {
        errors.push(`${location}: JSX belongs in src/components/<area>.`)
        return
      }
      ts.forEachChild(node, checkNode)
    }
    checkNode(file)
  }
}

checkDirectory(sourceRoot)
if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else {
  console.log("Web folder boundaries passed.")
}
