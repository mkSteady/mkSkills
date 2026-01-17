#!/usr/bin/env node
/**
 * CLAUDE.md Generator - Create layered index system
 * Usage: node generate.js [--layer 1|2|3] [--module path] [--auto]
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Load templates
const TEMPLATES = {
  root: `# {PROJECT_NAME}

{DESCRIPTION}

## Tech Stack

{TECH_STACK}

## Module Index

When working on a specific module, read its CLAUDE.md for context:

{MODULE_INDEX}

## Global Conventions

- {CONVENTIONS}
`,

  module: `# {MODULE_NAME}

{DESCRIPTION}

## Core Files

{CORE_FILES}

## Key Concepts

{CONCEPTS}

## Submodule Index

{SUBMODULE_INDEX}

## Common Tasks

### Task 1
1. Step one
2. Step two

`,

  submodule: `# {SUBMODULE_NAME}

{DESCRIPTION}

## Core Files

{CORE_FILES}

## Implementation Details

{DETAILS}

## Configuration

{CONFIG}
`
};

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readPackageJson(rootPath) {
  const pkgPath = path.join(rootPath, 'package.json');
  if (await exists(pkgPath)) {
    const content = await fs.readFile(pkgPath, 'utf-8');
    return JSON.parse(content);
  }
  return null;
}

async function detectProjectInfo(rootPath) {
  const pkg = await readPackageJson(rootPath);
  const dirName = path.basename(rootPath);

  return {
    name: pkg?.name || dirName,
    description: pkg?.description || 'Project description here.',
    version: pkg?.version || '0.0.0',
  };
}

async function detectTechStack(rootPath) {
  const stack = [];
  const checks = [
    ['package.json', async () => {
      const pkg = await readPackageJson(rootPath);
      if (pkg?.dependencies?.next || pkg?.devDependencies?.next) stack.push('Next.js');
      if (pkg?.dependencies?.react) stack.push('React');
      if (pkg?.dependencies?.vue) stack.push('Vue');
      if (pkg?.dependencies?.express) stack.push('Express');
      if (pkg?.devDependencies?.typescript) stack.push('TypeScript');
      if (pkg?.dependencies?.prisma || pkg?.devDependencies?.prisma) stack.push('Prisma');
      if (pkg?.dependencies?.tailwindcss || pkg?.devDependencies?.tailwindcss) stack.push('Tailwind CSS');
    }],
    ['pyproject.toml', () => stack.push('Python')],
    ['go.mod', () => stack.push('Go')],
    ['Cargo.toml', () => stack.push('Rust')],
  ];

  for (const [file, handler] of checks) {
    if (await exists(path.join(rootPath, file))) {
      await handler();
    }
  }

  return stack;
}

async function scanModules(rootPath) {
  const modules = [];
  const moduleDirs = ['src/modules', 'src/features', 'packages', 'apps'];

  for (const dir of moduleDirs) {
    const fullPath = path.join(rootPath, dir);
    if (await exists(fullPath)) {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          modules.push({
            name: entry.name,
            path: path.join(dir, entry.name),
            type: dir.includes('packages') ? 'package' : 'module',
          });
        }
      }
    }
  }

  return modules;
}

async function generateRootClaude(rootPath) {
  const info = await detectProjectInfo(rootPath);
  const techStack = await detectTechStack(rootPath);
  const modules = await scanModules(rootPath);

  let content = TEMPLATES.root
    .replace('{PROJECT_NAME}', info.name)
    .replace('{DESCRIPTION}', info.description)
    .replace('{TECH_STACK}', techStack.map(t => `- ${t}`).join('\n') || '- TODO: Add tech stack')
    .replace('{CONVENTIONS}', 'TODO: Add project conventions');

  // Generate module index
  if (modules.length > 0) {
    const index = modules.map(m =>
      `- **${m.name}**: \`${m.path}/CLAUDE.md\`\n  - TODO: Add description`
    ).join('\n\n');
    content = content.replace('{MODULE_INDEX}', index);
  } else {
    content = content.replace('{MODULE_INDEX}', '- No modules detected. Add modules to src/modules/ or packages/');
  }

  return content;
}

async function generateModuleClaude(modulePath, rootPath) {
  const moduleName = path.basename(modulePath);
  const fullPath = path.join(rootPath, modulePath);

  // Scan core files
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  const coreFiles = entries
    .filter(e => e.isFile() && /\.(ts|js|tsx|jsx|py)$/.test(e.name))
    .filter(e => !e.name.includes('.test.') && !e.name.includes('.spec.'))
    .map(e => `- \`${e.name}\``)
    .slice(0, 10);

  const submodules = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map(e => `- **${e.name}**: \`${modulePath}/${e.name}/CLAUDE.md\``);

  let content = TEMPLATES.module
    .replace('{MODULE_NAME}', moduleName.charAt(0).toUpperCase() + moduleName.slice(1) + ' Module')
    .replace('{DESCRIPTION}', 'TODO: Describe this module')
    .replace('{CORE_FILES}', coreFiles.join('\n') || '- TODO: List core files')
    .replace('{CONCEPTS}', '- TODO: Add key concepts')
    .replace('{SUBMODULE_INDEX}', submodules.length > 0 ? submodules.join('\n') : 'No submodules.');

  return content;
}

async function main() {
  const args = process.argv.slice(2);
  const rootPath = process.cwd();

  const layer = args.includes('--layer') ? args[args.indexOf('--layer') + 1] : null;
  const modulePath = args.includes('--module') ? args[args.indexOf('--module') + 1] : null;
  const auto = args.includes('--auto');
  const dryRun = args.includes('--dry-run');

  if (!layer && !auto) {
    console.log('Usage:');
    console.log('  node generate.js --layer 1              # Generate root CLAUDE.md');
    console.log('  node generate.js --layer 2 --module src/modules/auth');
    console.log('  node generate.js --auto                 # Generate all layers');
    console.log('  node generate.js --auto --dry-run       # Preview without writing');
    return;
  }

  if (layer === '1' || auto) {
    console.log('Generating root CLAUDE.md...');
    const content = await generateRootClaude(rootPath);

    if (dryRun) {
      console.log('\n--- CLAUDE.md (preview) ---\n');
      console.log(content);
    } else {
      await fs.writeFile(path.join(rootPath, 'CLAUDE.md'), content);
      console.log('✓ Created CLAUDE.md');
    }
  }

  if (layer === '2' || auto) {
    const modules = await scanModules(rootPath);

    for (const mod of modules) {
      console.log(`Generating ${mod.path}/CLAUDE.md...`);
      const content = await generateModuleClaude(mod.path, rootPath);

      if (dryRun) {
        console.log(`\n--- ${mod.path}/CLAUDE.md (preview) ---\n`);
        console.log(content.slice(0, 500) + '...\n');
      } else {
        await fs.writeFile(path.join(rootPath, mod.path, 'CLAUDE.md'), content);
        console.log(`✓ Created ${mod.path}/CLAUDE.md`);
      }
    }
  }

  console.log('\nDone! Review and customize the generated CLAUDE.md files.');
}

main().catch(console.error);
