#!/usr/bin/env node
/* Pack the library folders into label-the-image.h5p (a ZIP).
 *
 * H5PEditor.ImageCoordinateSelector-1.2 is our modified fork and lives
 * directly in this repo.
 *
 * H5PEditor.VerticalTabs-1.3 is the unmodified official release. It is
 * excluded from version control (.gitignore). This script downloads and
 * extracts it automatically the first time (or if the folder is missing).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'label-the-image.h5p');

const LIBRARIES = [
  'H5P.LabelTheImage-1.2',
  'H5PEditor.ImageCoordinateSelector-1.2',
  'H5PEditor.VerticalTabs-1.3'
];

// Official release download for unmodified editor dependencies.
// Key: folder name expected in ROOT. Value: GitHub release .zip URL.
const FETCH_IF_MISSING = {
  'H5PEditor.VerticalTabs-1.3': {
    url: 'https://github.com/h5p/h5p-editor-vertical-tabs/archive/refs/tags/1.3.zip',
    // The archive root folder name inside the zip (GitHub convention: repo-tag)
    zipRoot: 'h5p-editor-vertical-tabs-1.3'
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.destroy();
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    };
    request(url);
  });
}

async function ensureEditorDeps() {
  for (const [folder, { url, zipRoot }] of Object.entries(FETCH_IF_MISSING)) {
    const dest = path.join(ROOT, folder);
    if (fs.existsSync(dest)) continue;

    console.log(`Downloading ${folder} from ${url} ...`);
    const tmpZip = path.join(ROOT, `_tmp_${folder}.zip`);
    await download(url, tmpZip);

    // Unzip using the system unzip command (available on Linux/macOS/CI) or
    // fall back to PowerShell Expand-Archive on Windows.
    const tmpDir = path.join(ROOT, `_tmp_${folder}_extracted`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      execSync(`unzip -q "${tmpZip}" -d "${tmpDir}"`, { stdio: 'inherit' });
    } catch {
      // Windows fallback
      execSync(
        `powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpDir}' -Force"`,
        { stdio: 'inherit' }
      );
    }

    // Move the inner folder to the expected name
    const extracted = path.join(tmpDir, zipRoot);
    if (!fs.existsSync(extracted)) {
      throw new Error(`Expected folder "${zipRoot}" inside zip, not found. Contents: ${fs.readdirSync(tmpDir).join(', ')}`);
    }
    fs.renameSync(extracted, dest);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(tmpZip);
    console.log(`  → extracted to ${dest}`);
  }
}

function walk(dir, base, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.posix.join(base, entry.name);
    if (entry.isDirectory()) walk(full, rel, onFile);
    else if (entry.isFile()) onFile(full, rel);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await ensureEditorDeps();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const output = fs.createWriteStream(OUT);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`Built ${OUT} (${archive.pointer()} bytes)`);
  });
  archive.on('error', (err) => { throw err; });
  archive.pipe(output);

  // h5p.json (content-level manifest).
  const h5pJson = {
    title: 'Label the Image',
    language: 'en',
    mainLibrary: 'H5P.LabelTheImage',
    embedTypes: ['iframe'],
    license: 'U',
    preloadedDependencies: [
      { machineName: 'H5P.LabelTheImage', majorVersion: 1, minorVersion: 2 }
    ]
  };
  archive.append(JSON.stringify(h5pJson, null, 2), { name: 'h5p.json' });

  // Minimal placeholder content/content.json.
  archive.append(JSON.stringify({
    taskDescription: 'Click each marker and type the name of the object.',
    points: [],
    behaviour: {
      enableRetry: true,
      enableSolutionsButton: true,
      enableCheckButton: true,
      inputMode: 'inline',
      acceptSpellingErrors: false,
      caseSensitive: false
    },
    overallFeedback: []
  }, null, 2), { name: 'content/content.json' });

  for (const lib of LIBRARIES) {
    const dir = path.join(ROOT, lib);
    if (!fs.existsSync(dir)) {
      console.error(`Missing library folder: ${dir}`);
      process.exit(1);
    }
    walk(dir, lib, (full, rel) => archive.file(full, { name: rel }));
  }

  archive.finalize();
}

main().catch((err) => { console.error(err); process.exit(1); });
