#!/usr/bin/env node
/**
 * Static checks for the vanilla-ESM build (replaces `tsc --noEmit`):
 *  - every relative import resolves to an existing file
 *  - no TypeScript files / imports remain
 *  - every CSS @import resolves
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "src");
const errors = [];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(src);

// 1. imports
const importPattern = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
for (const file of files.filter((name) => name.endsWith(".js"))) {
  const code = readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  if (/\.ts["']/.test(code)) errors.push(`${rel}: imports a .ts file`);
  for (const match of code.matchAll(importPattern)) {
    const spec = match[1] ?? match[2];
    if (!spec.startsWith(".")) continue;
    const target = path.resolve(path.dirname(file), spec);
    const candidates = [target, `${target}.js`, path.join(target, "index.js"), target];
    if (!candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile())) {
      errors.push(`${rel}: unresolved import "${spec}"`);
    }
  }
}

// 2. no TypeScript leftovers
for (const file of files) {
  if (/\.(ts|tsx)$/.test(file)) errors.push(`${path.relative(root, file)}: TypeScript file still present`);
}

// 3. CSS imports
const stylesIndex = path.join(src, "styles", "index.css");
if (existsSync(stylesIndex)) {
  const css = readFileSync(stylesIndex, "utf8");
  for (const match of css.matchAll(/@import\s+["']([^"']+)["']/g)) {
    const target = path.resolve(path.dirname(stylesIndex), match[1]);
    if (!existsSync(target)) errors.push(`styles/index.css: missing @import ${match[1]}`);
  }
}

if (errors.length) {
  console.error(`check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`check ok: ${files.length} files`);
