# H5P.LabelTheImage

A custom [H5P](https://h5p.org/) content type. Authors upload an image and drop numbered points on it; learners type the name of the object at each point to score.

## Features

- Click-to-place points in the editor via the standard `imageCoordinateSelector` widget
- Per-point accepted answers (`/`-separated alternatives, e.g. `cat/kitten/feline`), case sensitivity, hint, and wrong-answer feedback
- Optional fuzzy matching for minor typos (Levenshtein ≤ `ceil(len/10)`, full credit, flagged as "almost")
- Three learner input modes (author-selectable):
  - **Popover** — click a marker to open a compact input
  - **List** — all inputs appear in a numbered list beside the image for review before submitting
  - **Inline** — input fields sit directly on the image at each point
- Retry, Show Solution, and overall-feedback score ranges
- Responsive (markers use percentage coordinates) and keyboard/screen-reader accessible
- xAPI `answered` statement for LMS grade reporting

## Repository layout

```
H5P.LabelTheImage-1.2/                  runtime library (this content type)
H5PEditor.ImageCoordinateSelector-1.2/  bundled editor widget dependency
H5PEditor.VerticalTabs-1.3/             bundled editor widget dependency
scripts/build-h5p.js                    packs libraries into a .h5p file
.github/workflows/build.yml             CI: build artifact + attach to tagged releases
```

The two `H5PEditor.*` folders are upstream libraries (`h5p/h5p-editor-image-coordinate-selector`, `h5p/h5p-editor-vertical-tabs`) bundled into the package so hosts that don't auto-fetch editor dependencies can install this content type directly.

## Build the `.h5p` package

```
npm install
npm run pack
```

Output: `dist/label-the-image.h5p`. Upload it through the H5P admin UI of WordPress, Moodle, Drupal, or any LMS with the H5P plugin.

## Install into WordPress

1. Settings → H5P → Libraries → **Upload a H5P file**, choose `dist/label-the-image.h5p`.
2. Add a new H5P content, pick **Label the Image**, upload a background image, click it to add points, fill in accepted answers.
3. Pick an input mode under **Behavioural settings** and save.

## Accepted-answer syntax

Separate alternatives with `/`, e.g. `cat/kitten/feline`. Leading/trailing whitespace is trimmed. Matches [`H5P.Blanks`](https://h5p.org/fill-in-the-blanks) convention.

## Compatibility

- H5P core ≥ 1.24
- Works with the WordPress H5P plugin, Moodle `mod_h5pactivity`, and the Drupal H5P module
- Embeds inside Question Set, Course Presentation, and Interactive Book

## Releases

Push a `v*` tag to trigger [.github/workflows/build.yml](.github/workflows/build.yml); the workflow builds `label-the-image.h5p` and attaches it to the GitHub Release.

```
git tag v1.2.2
git push origin v1.2.2
```

## License

MIT — see [LICENSE](./LICENSE). Bundled `H5PEditor.*` libraries retain their upstream MIT licenses.
