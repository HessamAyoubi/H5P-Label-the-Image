#!/usr/bin/env node
/* Pack the library folders into label-the-image.h5p (a ZIP). */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'label-the-image.h5p');

const LIBRARIES = [
  'H5P.LabelTheImage-1.2',
  'H5PEditor.ImageCoordinateSelector-1.2',
  'H5PEditor.VerticalTabs-1.3'
];

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const output = fs.createWriteStream(OUT);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Built ${OUT} (${archive.pointer()} bytes)`);
});
archive.on('error', (err) => { throw err; });
archive.pipe(output);

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

function walk(dir, base, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.posix.join(base, entry.name);
    if (entry.isDirectory()) walk(full, rel, onFile);
    else if (entry.isFile()) onFile(full, rel);
  }
}

for (const lib of LIBRARIES) {
  const dir = path.join(ROOT, lib);
  if (!fs.existsSync(dir)) {
    console.error(`Missing library folder: ${dir}`);
    process.exit(1);
  }
  walk(dir, lib, (full, rel) => archive.file(full, { name: rel }));
}

archive.finalize();
