# satware® AI image

A unified TypingMind plugin for image generation and image editing using Google
Gemini. Two functions in one plugin:

1. **generate_image** - Create new image(s) from a text prompt (1-4 per call)
2. **edit_image** - Modify an uploaded image OR a previously-generated image in
   the same conversation (tool-chaining)

Built on Google Gemini image models:
- `gemini-3-pro-image` (Nano Banana Pro, default) - best capability, character
  consistency, multi-turn editing
- `gemini-3.1-flash-image` (Banana 2) - fast, lower cost
- `gemini-2.5-flash-image` (Nano Banana, legacy)

## Setup

1. Import from GitHub: `https://github.com/satwareAG/satag-image-plugin`
2. Enter your Google Gemini API key in the plugin settings
   (get one at https://aistudio.google.com/app/apikey)
3. (Optional) Select a model, quality preset, prompt enhancement mode
4. Enable the plugin

## Why this plugin exists

Replaces three scattered image plugins across the fleet with a single
canonical plugin. All three variants did the same thing - generate and
edit images via Gemini - under different names. This plugin unifies them.

## Smart Prompt Enhancement

- **9 Professional Presets**: Photography, Promotional Products, Corporate
  Branding, Artistic Creative, Social Media Content, Technical Illustration,
  Lifestyle Photography, Product Mockup, Custom
- **Industry Focus**: Automotive, Healthcare, Technology, Finance, Education,
  Retail, Real Estate, Food Beverage, Fashion, Sports Recreation
- **Brand Compliance**: Strict Corporate, Creative Corporate, Startup Modern,
  Luxury Premium, Approachable Friendly, Technical Precise

## Quality Presets

| Preset | Temperature | topP | topK | Use case |
|--------|-------------|------|------|----------|
| Maximum Consistency | 0.2 | 0.7 | 20 | Brand-consistent content |
| Balanced (default) | 0.7 | 0.9 | 40 | Professional quality + creativity |
| Creative Exploration | 0.9 | 0.95 | 80 | Maximum artistic freedom |
| Custom | (user) | (user) | (user) | Full manual control |

## Edit mode (tool-chaining)

`edit_image` auto-detects image sources in priority order:

1. `userMessage.attachments` (user-uploaded images)
2. `previousRunOutput.cards` (the previous image produced by `generate_image`
   or `edit_image` in the same conversation)

This means you can: generate an image, then ask for edits without re-uploading.
Pattern borrowed from `TypingMind/plugin-gpt-image-editor`.

## Pricing

Google Gemini image generation is billed per image. See the public pricing:
https://ai.google.dev/gemini-api/docs/pricing

## Backlog

The following features are tracked in the Gitea issue tracker (not yet
implemented):

- **Character Consistency / Identity Preservation** - uploaded characters
  (e.g. the satware® robot "Ritchie") should be preserved exactly across
  new scenes without losing distinctive details.
- **Asset Integration / Image Blending** - project a secondary image (e.g. a
  logo) onto a primary image with correct perspective, texture, light, and
  shadow.

Both features are best-supported by the default `gemini-3-pro-image` model,
which is selected for this reason.

## Owner

Jane Alesi (AI Architect), satware AG
