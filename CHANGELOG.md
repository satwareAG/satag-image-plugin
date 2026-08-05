# Changelog

All notable changes to **satware® AI image** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-08-05

### Added
- **`generate_image` character/object consistency (issue #1)**: `generate_image`
  now accepts an optional 3rd parameter `authorizedResources` and reads
  uploaded reference images from `userMessage.attachments` (image/* types).
  When reference images are present, they are sent as `inlineData` parts
  alongside the scene prompt in a single `generateContent` call, and a
  consistency instruction ("Preserve the character or object in the reference
  image(s) exactly...") is prepended to the prompt. Gemini `gemini-3-pro-image`
  supports up to 14 reference images. No new userSettings (purely prompt +
  image driven; the Gemini API has no `reference_strength`/seed/character-mode
  parameter).
- **`edit_image` asset integration / blending (issue #1)**: when 2+ images are
  attached, `edit_image` now uses a composite/blend instruction (correct
  perspective, lighting, shadows, surface texture) instead of the standard
  edit suffix. Single-image edits keep the original "maintaining original
  image quality and consistency" suffix (backward compatible). The function
  already sent all attached images as `inlineData` parts; this change only
  adapts the prompt suffix based on image count.
- New helpers in `implementation.js` (+ mirrored in `pluginFunctions[0].code`):
  `extractReferenceImages(authorizedResources)` and
  `imageToInlineData(url)`.
- 13 new tests (6 behavioral + 5 helper + 2 integration stubs): reference-image
  parts structure, multi-reference (2 inlineData), backward-compat (no
  references = text-only), non-image attachments ignored, all-encodings-fail
  fallback (no consistency prefix when no reference was actually encoded),
  2-image edit composite instruction, 1-image edit standard suffix,
  `extractReferenceImages` + `imageToInlineData` helper tests. Integration
  stubs gated on `GEMINI_API_KEY` (character consistency + 2-image blending).
- Constitution v1.1.0: Art. IV amended (generate_image now accepts reference
  images; edit_image now also composites/blends 2+ images).

### Changed
- `dynamicContextEndpoints` (2 entries) updated: `generate_image` guidance now
  mentions reference-image support; `edit_image` guidance now mentions
  2+-image compositing/blending.
- `openaiSpec` descriptions updated (top-level + both pluginFunctions) to
  reflect the new capabilities.
- Version bumped 1.0.0 -> 1.1.0 (plugin.json + package.json + CHANGELOG.md).

### Security
- No new userSettings, no new secrets. Reference images are read from
  TypingMind-provided `authorizedResources` (no filesystem/network access
  beyond the existing Gemini `fetch`).

## [1.0.0] - 2026-08-05

### Added
- `generate_image`: create new image(s) from a text prompt (1-4 per call) using
  Google Gemini image models (default `gemini-3-pro-image`; `gemini-3.1-flash-image`
  and `gemini-2.5-flash-image` available via userSetting)
- `edit_image`: edit an uploaded image OR a previously-generated image
  (tool-chaining via `previousRunOutput.cards`) using a text instruction;
  auto-detects image sources in priority order (attachments first, then
  previous tool output)
- Hybrid plugin pattern: `implementation.js` (primary function, loaded by
  TypingMind from GitHub) + `pluginFunctions[]` with embedded self-contained
  code for both functions (helpers duplicated per entry per iframe-sandbox rules)
- `dynamicContextEndpoints` (2 entries) for model tool-routing guidance
- 13 `userSettings`: `geminiApiKey` (required, no defaultValue - Constitution
  Art. XII), model, prompt enhancement presets (8 modes), quality presets
  (4 modes), industry focus (10 industries), brand compliance (6 modes),
  safety mode, defaults
- `outputType: "cards"` - images render as image cards in the chat UI
  (deliberate exception to the satag `respond_to_ai` default; both TypingMind
  reference image plugins use `cards`)
- Constitution v1.0.0 (12 articles): browser-native, modern JS, hybrid plugin
  pattern, dual functions with clear routing, cards output, no external deps,
  no PII leakage, dual-variant repo, public privacy boundary, plugin
  test-first, no hardcoded secrets
- `tests/run-tests.js`: TDD test suite (50 tests), no framework dependency,
  loads `generate_image` from `implementation.js` and `edit_image` from
  `plugin.json` `pluginFunctions[1].code` via `new Function()` (mirrors
  TypingMind's iframe eval)
- Unifies three prior fleet image plugins into one canonical plugin (internal
  tenant names omitted for privacy).
- Reference patterns borrowed (MIT): `TypingMind/plugin-gpt-image-editor`
  (attachment detection + `previousRunOutput` tool-chaining),
  `TypingMind/plugin-generate-image-grok` (multi-image `n=1..4` -> cards).
  Only the Gemini backend ships in v1; xAI Grok and OpenAI gpt-image backends
  were not taken.
- `LICENSE` (MIT, satware AG), `README.md`, `specs/metadata.json` (IPADP L1),
  `CHANGELOG.md` (6th public file), `AGENTS.md`, `tests/run-tests.js` (51 tests)

### Changed
- Top-level `id` + `openaiSpec.name`: `satware_image` -> `generate_image`
  (matches primary function name, per satag-time-plugin proven pattern;
  prevents the model from hallucinating a non-existent `satware_image`
  function). Regression test locks this in.

### Security
- Scrubbed a hardcoded default Gemini API key
  (`AIzaSyBh3IdiFtE_0kgojboBlV0tJRgGw_IPEBk`) from the original export's
  `userSettings.geminiApiKey.defaultValue`. The key is flagged for rotation
  (operational, tracked in issue #6); reintroducing a default key fails the
  privacy scan and the test suite (Constitution Art. XII).
