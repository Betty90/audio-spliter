#!/usr/bin/env node
/**
 * Build script for AudioSlicer AI
 * Orchestrates Python, frontend, Electron, and packaging builds
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');

const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${step}`, 'bright');
  log(`${'='.repeat(60)}\n`, 'cyan');
}

function exec(command, options = {}) {
  const defaultOptions = {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...options.env },
  };

  try {
    execSync(command, { ...defaultOptions, ...options });
    return true;
  } catch (error) {
    if (!options.ignoreError) {
      log(`Command failed: ${command}`, 'red');
      log(error.message, 'red');
      process.exit(1);
    }
    return false;
  }
}

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const defaultOptions = {
      cwd: rootDir,
      stdio: 'inherit',
      shell: IS_WINDOWS,
      env: { ...process.env, ...options.env },
    };

    const proc = spawn(command, args, { ...defaultOptions, ...options });

    proc.on('close', (code) => {
      if (code !== 0 && !options.ignoreError) {
        reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}`));
      } else {
        resolve(code);
      }
    });

    proc.on('error', (error) => {
      if (!options.ignoreError) {
        reject(error);
      } else {
        resolve(1);
      }
    });
  });
}

function cleanBuildDirs() {
  logStep('CLEANING BUILD DIRECTORIES');

  const dirsToClean = [
    'dist',
    'electron/dist',
    'release',
    'python-dist',
  ];

  for (const dir of dirsToClean) {
    const fullPath = join(rootDir, dir);
    if (existsSync(fullPath)) {
      log(`Removing ${dir}...`, 'yellow');
      rmSync(fullPath, { recursive: true, force: true });
    }
  }

  log('Clean complete!', 'green');
}

function ensureDirs() {
  const dirs = [
    'electron/dist',
    'python-dist',
    'release',
  ];

  for (const dir of dirs) {
    const fullPath = join(rootDir, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  }
}

async function buildPython() {
  logStep('BUILDING PYTHON BACKEND');

  const buildScript = IS_WINDOWS ? 'scripts/build-python.bat' : 'scripts/build-python.sh';

  if (!existsSync(join(rootDir, buildScript))) {
    log(`Python build script not found: ${buildScript}`, 'yellow');
    log('Skipping Python build - assuming Python backend will run from source', 'yellow');
    return;
  }

  try {
    if (IS_WINDOWS) {
      await runCommand('cmd', ['/c', buildScript]);
    } else {
      await runCommand('bash', [buildScript]);
    }
    log('Python build complete!', 'green');
  } catch (error) {
    log(`Python build failed: ${error.message}`, 'red');
    log('Continuing without Python bundling...', 'yellow');
  }
}

async function buildFrontend() {
  logStep('BUILDING FRONTEND');

  log('Running Vite build...', 'blue');
  await runCommand('npm', ['run', 'build']);

  log('Frontend build complete!', 'green');
}

async function buildElectron() {
  logStep('BUILDING ELECTRON MAIN PROCESS');

  log('Compiling TypeScript...', 'blue');
  await runCommand('npm', ['run', 'electron:build']);

  log('Electron build complete!', 'green');
}

async function packageApp() {
  logStep('PACKAGING APPLICATION');

  log('Running electron-builder...', 'blue');

  const args = ['run', 'electron:pack', '--'];

  if (process.argv.includes('--publish')) {
    args.push('--publish', 'always');
  }

  if (process.argv.includes('--mac')) {
    args.push('--mac');
  } else if (process.argv.includes('--win')) {
    args.push('--win');
  } else if (process.argv.includes('--linux')) {
    args.push('--linux');
  }

  await runCommand('npm', args);

  log('Packaging complete!', 'green');
}

function copyResources(requirePythonBackend = false) {
  logStep('COPYING RESOURCES');

  const resourcesDir = join(rootDir, 'resources');
  if (existsSync(resourcesDir)) {
    log('Resources directory exists', 'blue');
  } else {
    log('Creating resources directory...', 'yellow');
    mkdirSync(resourcesDir, { recursive: true });
  }

  const pythonBuildCandidates = [
    join(rootDir, 'py-dist', 'server'),
    join(rootDir, 'backend', 'dist', 'server'),
    join(rootDir, 'dist', 'server'),
  ];
  const pythonBuildDir = pythonBuildCandidates.find(existsSync);
  const serverResourcesDir = join(resourcesDir, 'server');

  if (pythonBuildDir) {
    log(`Copying Python backend build output from ${pythonBuildDir}...`, 'blue');

    if (existsSync(serverResourcesDir)) {
      log('Removing existing resources/server...', 'yellow');
      rmSync(serverResourcesDir, { recursive: true, force: true });
    }

    const copyRecursive = (src, dest) => {
      if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
      }

      const entries = readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (entry.isDirectory()) {
          copyRecursive(srcPath, destPath);
        } else {
          copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursive(pythonBuildDir, serverResourcesDir);
    log(`Copied Python backend to resources/server`, 'green');
  } else {
    log('Python build output not found in py-dist/server, backend/dist/server, or dist/server', 'yellow');
    if (requirePythonBackend) {
      log('Python backend is required for packaging; aborting.', 'red');
      process.exit(1);
    } else {
      log('Skipping Python backend copy...', 'yellow');
    }
  }

  log('Resources ready!', 'green');
}

function showHelp() {
  console.log(`
AudioSlicer AI Build Script

Usage: node scripts/build.js [options]

Options:
  --clean       Clean build directories before building
  --python      Build Python backend only
  --frontend    Build frontend only
  --electron    Build Electron main process only
  --pack        Package the application (creates installers)
  --publish     Publish to GitHub Releases (requires --pack)
  --mac         Build for macOS only
  --win         Build for Windows only
  --linux       Build for Linux only
  --help        Show this help message

Examples:
  node scripts/build.js --clean --pack     # Full clean build and package
  node scripts/build.js --frontend         # Build frontend only
  node scripts/build.js --pack --mac       # Package for macOS only
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    showHelp();
    return;
  }

  const shouldClean = args.includes('--clean');
  const shouldBuildPython = args.includes('--python') || args.length === 0 || (args.includes('--pack') && !args.some(a => ['--frontend', '--electron'].includes(a)));
  const shouldBuildFrontend = args.includes('--frontend') || args.length === 0 || args.includes('--pack');
  const shouldBuildElectron = args.includes('--electron') || args.length === 0 || args.includes('--pack');
  const shouldPackage = args.includes('--pack');

  log(`
${'='.repeat(60)}
  AudioSlicer AI Build Script
  Platform: ${IS_WINDOWS ? 'Windows' : IS_MAC ? 'macOS' : IS_LINUX ? 'Linux' : 'Unknown'}
${'='.repeat(60)}
`, 'magenta');

  const startTime = Date.now();

  try {
    ensureDirs();

    if (shouldClean) {
      cleanBuildDirs();
      ensureDirs();
    }

    if (shouldBuildPython) {
      await buildPython();
    }

    if (shouldBuildFrontend) {
      await buildFrontend();
    }

    if (shouldBuildElectron) {
      await buildElectron();
    }

    copyResources(shouldPackage || shouldBuildPython);

    if (shouldPackage) {
      await packageApp();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    log(`
${'='.repeat(60)}`, 'green');
    log('  BUILD SUCCESSFUL!', 'bright');
    log(`  Duration: ${duration}s`, 'green');
    if (shouldPackage) {
      log(`  Output: ${join(rootDir, 'release')}`, 'green');
    }
    log(`${'='.repeat(60)}\n`, 'green');

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    log(`
${'='.repeat(60)}`, 'red');
    log('  BUILD FAILED!', 'bright');
    log(`  Duration: ${duration}s`, 'red');
    log(`  Error: ${error.message}`, 'red');
    log(`${'='.repeat(60)}\n`, 'red');

    process.exit(1);
  }
}

main();
