/**
 * satware® AI image - TypingMind plugin
 *
 * Primary function: generate_image (loaded by TypingMind from this file).
 * Secondary function: edit_image (embedded in plugin.json pluginFunctions[]).
 *
 * Unifies three prior TypingMind image plugins into one canonical plugin.
 *
 * Backend: Google Gemini image models (gemini-3-pro-image default;
 * gemini-3.1-flash-image and gemini-2.5-flash-image available via userSetting).
 * Reference patterns borrowed from TypingMind/plugin-gpt-image-editor
 * (attachment detection + previousRunOutput tool-chaining) and
 * TypingMind/plugin-generate-image-grok (multi-image n=1..4 -> cards).
 *
 * v1.1.0: generate_image now accepts optional reference images (uploaded
 * attachments) for character/object consistency across new scene generations
 * (issue #1). edit_image already supports multi-image compositing/blending.
 * Both features use Gemini's multi-inlineData parts in a single
 * generateContent call (no multi-turn chat needed).
 *
 * Output: TypingMind cards ({cards:[{type:'image', image:{url,alt,sync:true}}]})
 * so generated/edited images render in the chat UI.
 *
 * Owner: Jane Alesi (AI Architect), satware AG.
 * License: MIT
 */

/**
 * generate_image - Create image(s) from a text prompt.
 *
 * v1.1.0: Accepts optional reference images (uploaded attachments via
 * authorizedResources.userMessage.attachments) for character/object
 * consistency. When reference images are present, they are sent as
 * inlineData parts alongside the scene prompt in a single generateContent
 * call, and a consistency instruction is prepended to the prompt so the
 * model preserves the character/object across the new scene (issue #1).
 * Gemini gemini-3-pro-image supports up to 14 reference images.
 *
 * @param {Object} params
 * @param {string} params.prompt - Image description / scene (required)
 * @param {number} [params.n] - Number of images to generate (1-4, default 1)
 * @param {string} [params.style] - "realistic"|"artistic"|"cartoon"|"abstract"|"photographic"|"cinematic"|"anime"
 * @param {number} [params.temperature] - Creativity 0..1 (override)
 * @param {number} [params.topP] - Nucleus sampling 0.1..1 (override)
 * @param {number} [params.topK] - Token selection 1..100 (override)
 * @param {Object} userSettings
 * @param {string} userSettings.geminiApiKey - Google Gemini API key (required)
 * @param {string} [userSettings.model] - Default model (default "gemini-3-pro-image")
 * @param {number} [userSettings.defaultImageCount] - Default n (1-4)
 * @param {string} [userSettings.defaultStyle] - Default style enum
 * @param {string} [userSettings.promptEnhancementMode] - "none"|"professional_photography"|...
 * @param {string} [userSettings.customPromptEnhancement] - Custom enhancement text
 * @param {string} [userSettings.qualityPreset] - "maximum_consistency"|"balanced"|"creative_exploration"|"custom"
 * @param {string} [userSettings.industryFocus] - Industry enum
 * @param {string} [userSettings.brandCompliance] - Brand mode enum
 * @param {string} [userSettings.safetyMode] - "disabled"|"minimal"|"balanced"|"strict"
 * @param {number} [userSettings.defaultTemperature] - Default creativity
 * @param {number} [userSettings.defaultTopP] - Default topP
 * @param {number} [userSettings.defaultTopK] - Default topK
 * @param {Object} [authorizedResources] - TypingMind-provided: {userMessage, previousRunOutput}
 *        Reference images for character consistency are read from
 *        authorizedResources.userMessage.attachments (image/* types only).
 * @returns {Object} { cards: [{type:'image', image:{url, alt, sync:true}}] }
 *          or throws Error on failure (TypingMind surfaces the message).
 */
async function generate_image(params, userSettings, authorizedResources) {
  const prompt = (params && params.prompt != null) ? String(params.prompt).trim() : '';
  if (!prompt) {
    return { isError: true, error: 'prompt is required for image generation.' };
  }
  const geminiApiKey = (userSettings && userSettings.geminiApiKey) ? String(userSettings.geminiApiKey).trim() : '';
  if (!geminiApiKey) {
    return { isError: true, error: 'Gemini API key is required. Configure it in the plugin settings.' };
  }
  const n = Math.min(Math.max(parseInt(params.n) || parseInt(userSettings.defaultImageCount) || 1, 1), 4);
  const style = params.style || userSettings.defaultStyle || '';
  const safetyMode = userSettings.safetyMode || 'balanced';
  const promptEnhancementMode = userSettings.promptEnhancementMode || 'none';
  const customPromptEnhancement = userSettings.customPromptEnhancement || '';
  const qualityPreset = userSettings.qualityPreset || 'balanced';
  const industryFocus = userSettings.industryFocus || '';
  const brandCompliance = userSettings.brandCompliance || '';
  const model = userSettings.model || 'gemini-3-pro-image';
  // v1.1.1: Config context appended to API-error messages for debugging.
  // Only API errors (not validation errors) get this context.
  const configContext = promptEnhancementMode !== 'none'
    ? ' [Enhancement: ' + promptEnhancementMode + ', Quality: ' + qualityPreset + ']'
    : '';

  const enhancedPrompt = buildEnhancedPrompt(prompt, promptEnhancementMode, customPromptEnhancement, industryFocus, brandCompliance, style);
  const qualityConfig = getQualityConfig(qualityPreset, params.temperature, params.topP, params.topK, userSettings);
  const safetySettings = getSafetySettings(safetyMode);
  const generationConfig = {
    temperature: Math.min(Math.max(qualityConfig.temperature, 0), 1),
    topP: Math.min(Math.max(qualityConfig.topP, 0.1), 1),
    topK: Math.min(Math.max(qualityConfig.topK, 1), 100),
    candidateCount: 1,
    maxOutputTokens: 1290,
    responseModalities: ['IMAGE']
  };
  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

  // Collect optional reference images for character/object consistency (issue #1).
  // Gemini supports multiple inlineData parts in a single generateContent call.
  // Encode once (hoisted out of the n-loop to avoid re-encoding per iteration)
  // and derive the consistency instruction from the parts that actually encoded,
  // so the model never receives a "Preserve the character..." instruction with no
  // reference image attached (which would cause hallucination or refusal).
  const referenceImageUrls = extractReferenceImages(authorizedResources);
  const referenceParts = [];
  for (const imageUrl of referenceImageUrls) {
    const inlinePart = await imageToInlineData(imageUrl);
    if (inlinePart) {
      referenceParts.push(inlinePart);
    }
  }
  const hasReferences = referenceParts.length > 0;
  const scenePrompt = hasReferences
    ? 'Preserve the character or object in the reference image(s) exactly - same proportions, colors, and distinctive details. Scene: ' + enhancedPrompt
    : enhancedPrompt;

  const cards = [];
  for (let i = 0; i < n; i++) {
    // Build multimodal parts: text prompt first, then reference images (inlineData).
    // Text-first matches the Gemini docs convention and mirrors edit_image's ordering.
    // referenceParts are reused across iterations (already-encoded inlineData).
    const parts = [{ text: scenePrompt }];
    for (const refPart of referenceParts) {
      parts.push(refPart);
    }
    const requestBody = {
      contents: [{ parts: parts }],
      safetySettings,
      generationConfig
    };
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
      body: JSON.stringify(requestBody)
    });
    if (response.status === 401) {
      return { isError: true, error: 'Invalid Gemini API Key. Please check the key in plugin settings.' };
    }
    if (response.status === 403) {
      return { isError: true, error: 'Access denied. Ensure your API key has image generation permissions.' };
    }
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'API request failed with status ' + response.status;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error && errorData.error.message) {
          errorMessage += ': ' + errorData.error.message;
          if (errorData.error.message.includes('safety')) {
            errorMessage += ' (Content blocked by safety filter.)';
          }
        }
      } catch (e) {
        errorMessage += ': ' + errorText.substring(0, 200);
      }
      return { isError: true, error: errorMessage + configContext };
    }
    const data = await response.json();
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      return { isError: true, error: 'Prompt blocked: ' + data.promptFeedback.blockReason + configContext };
    }
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
      return { isError: true, error: 'No image generated for request ' + (i + 1) + configContext };
    }
    const candidate = data.candidates[0];
    if (candidate.finishReason === 'SAFETY') {
      const safetyRatings = candidate.safetyRatings || [];
      const blockedCategories = safetyRatings.filter(function (r) { return r.blocked; }).map(function (r) { return r.category; }).join(', ');
      return { isError: true, error: 'Content blocked by safety filters: ' + blockedCategories + configContext };
    }
    if (!candidate.content || !candidate.content.parts) {
      return { isError: true, error: 'Invalid response format for image ' + (i + 1) + configContext };
    }
    const imagePart = candidate.content.parts.find(function (part) { return part.inlineData && part.inlineData.data; });
    if (!imagePart) {
      return { isError: true, error: 'Image ' + (i + 1) + ' does not contain valid data.' + configContext };
    }
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const enhancementInfo = promptEnhancementMode !== 'none'
      ? ' (Enhanced: ' + promptEnhancementMode + (industryFocus ? ', ' + industryFocus : '') + (brandCompliance ? ', ' + brandCompliance : '') + ')'
      : '';
    const refInfo = hasReferences
      ? ' (with ' + referenceParts.length + ' reference image' + (referenceParts.length > 1 ? 's' : '') + ' for consistency)'
      : '';
    cards.push({
      type: 'image',
      image: {
        url: 'data:' + mimeType + ';base64,' + imagePart.inlineData.data,
        alt: prompt.replace(/[[\]]/g, '') + refInfo + enhancementInfo,
        sync: true
      }
    });
  }
  return { cards };
}

/**
 * buildEnhancedPrompt - Apply professional enhancement presets to a base prompt.
 *
 * @param {string} basePrompt
 * @param {string} enhancementMode - "none"|"professional_photography"|...
 * @param {string} customEnhancement - Custom enhancement text (when mode === 'custom')
 * @param {string} industry - Industry focus enum
 * @param {string} brand - Brand compliance enum
 * @param {string} stylePreference - Style enum (realistic/artistic/...)
 * @returns {string} Enhanced prompt
 */
function buildEnhancedPrompt(basePrompt, enhancementMode, customEnhancement, industry, brand, stylePreference) {
  const enhancementTemplates = {
    'professional_photography': 'professional studio photography, perfect lighting, high-end commercial quality, crisp details, professional composition',
    'promotional_products': 'promotional product photography, clean background, professional lighting, corporate quality, suitable for business presentations, brand compliant, marketing ready',
    'artistic_creative': 'artistic interpretation, creative composition, unique perspective, enhanced visual impact, professional artistic quality, museum-worthy',
    'corporate_branding': 'corporate professional style, brand-appropriate, business presentation quality, clean and polished, enterprise-grade, executive level',
    'social_media_content': 'social media optimized, engaging visual appeal, trendy aesthetic, platform-ready, high engagement potential, viral quality',
    'technical_illustration': 'technical precision, clear documentation style, professional diagram quality, detailed and accurate, engineering grade',
    'lifestyle_photography': 'lifestyle photography, natural lighting, authentic feel, professional quality, engaging composition, relatable',
    'product_mockup': 'product mockup presentation, professional staging, commercial photography style, marketing ready, showcase quality'
  };
  const industryEnhancements = {
    'automotive': 'automotive industry standards, sleek design, precision engineering aesthetic',
    'healthcare': 'healthcare professional standards, clean and sterile aesthetic, trustworthy presentation',
    'technology': 'cutting-edge technology aesthetic, modern digital design, innovation-focused',
    'finance': 'financial industry professionalism, trustworthy and stable presentation, executive quality',
    'education': 'educational clarity, accessible design, professional academic standards',
    'retail': 'retail appeal, customer-focused, commercial attractiveness, market-ready',
    'real_estate': 'real estate presentation quality, aspirational aesthetic, professional staging',
    'food_beverage': 'food photography standards, appetizing presentation, commercial quality',
    'fashion': 'fashion industry standards, style-forward, trend-conscious, editorial quality',
    'sports_recreation': 'dynamic sports aesthetic, energetic presentation, athletic appeal'
  };
  const brandStyles = {
    'strict_corporate': 'strict corporate guidelines, conservative presentation, traditional business aesthetic',
    'creative_corporate': 'modern corporate style, creative within professional bounds, innovative yet professional',
    'startup_modern': 'startup aesthetic, modern and agile, innovative and approachable',
    'luxury_premium': 'luxury presentation, premium quality, sophisticated and elegant',
    'approachable_friendly': 'friendly and accessible, warm presentation, human-centered design',
    'technical_precise': 'technical precision, documentation-quality, accurate and detailed'
  };
  let enhancedPrompt = basePrompt;
  if (enhancementMode === 'custom' && customEnhancement) {
    enhancedPrompt = enhancedPrompt + ', ' + customEnhancement;
  } else if (enhancementMode !== 'none' && enhancementTemplates[enhancementMode]) {
    enhancedPrompt = enhancedPrompt + ', ' + enhancementTemplates[enhancementMode];
  }
  if (industry && industryEnhancements[industry]) {
    enhancedPrompt = enhancedPrompt + ', ' + industryEnhancements[industry];
  }
  if (brand && brandStyles[brand]) {
    enhancedPrompt = enhancedPrompt + ', ' + brandStyles[brand];
  }
  if (stylePreference) {
    enhancedPrompt = enhancedPrompt + ', rendered in ' + stylePreference + ' style';
  }
  return enhancedPrompt;
}

/**
 * getQualityConfig - Resolve quality preset to temperature/topP/topK values.
 *
 * @param {string} preset - "maximum_consistency"|"balanced"|"creative_exploration"|"custom"
 * @param {number} userTemperature - Per-call override
 * @param {number} userTopP - Per-call override
 * @param {number} userTopK - Per-call override
 * @param {Object} userSettings - For custom preset defaults
 * @returns {{temperature:number, topP:number, topK:number}}
 */
function getQualityConfig(preset, userTemperature, userTopP, userTopK, userSettings) {
  const qualityPresets = {
    'maximum_consistency': { temperature: 0.2, topP: 0.7, topK: 20 },
    'balanced': { temperature: 0.7, topP: 0.9, topK: 40 },
    'creative_exploration': { temperature: 0.9, topP: 0.95, topK: 80 },
    'custom': {
      temperature: parseFloat(userSettings && userSettings.defaultTemperature) || 0.7,
      topP: parseFloat(userSettings && userSettings.defaultTopP) || 0.9,
      topK: parseInt(userSettings && userSettings.defaultTopK) || 40
    }
  };
  const presetConfig = qualityPresets[preset] || qualityPresets['balanced'];
  return {
    temperature: userTemperature !== undefined ? userTemperature : presetConfig.temperature,
    topP: userTopP !== undefined ? userTopP : presetConfig.topP,
    topK: userTopK !== undefined ? userTopK : presetConfig.topK
  };
}

/**
 * getSafetySettings - Map safetyMode enum to Gemini safety category thresholds.
 *
 * @param {string} mode - "disabled"|"minimal"|"balanced"|"strict"
 * @returns {Array<{category:string, threshold:string}>}
 */
function getSafetySettings(mode) {
  const safetyLevels = {
    'disabled': 'BLOCK_NONE',
    'minimal': 'BLOCK_ONLY_HIGH',
    'balanced': 'BLOCK_MEDIUM_AND_ABOVE',
    'strict': 'BLOCK_LOW_AND_ABOVE'
  };
  const threshold = safetyLevels[mode] || safetyLevels['balanced'];
  const balancedDangerousThreshold = mode === 'balanced' ? 'BLOCK_ONLY_HIGH' : threshold;
  return [
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: threshold },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: threshold },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: threshold },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: balancedDangerousThreshold }
  ];
}

/**
 * extractReferenceImages - Collect image URLs from authorizedResources attachments.
 *
 * Used by generate_image for character/object consistency (issue #1): uploaded
 * reference images are passed as inlineData parts alongside the scene prompt.
 * Only image/* attachments are collected.
 *
 * @param {Object} [authorizedResources] - TypingMind-provided: {userMessage, previousRunOutput}
 * @returns {string[]} Array of image URLs (may be empty)
 */
function extractReferenceImages(authorizedResources) {
  try {
    const attachments = (authorizedResources && authorizedResources.userMessage && authorizedResources.userMessage.attachments) || [];
    return attachments
      .filter(function (item) { return item && item.type && item.type.startsWith('image/'); })
      .map(function (c) { return c.url; })
      .filter(function (url) { return url; });
  } catch (e) {
    return [];
  }
}

/**
 * imageToInlineData - Convert an image URL (data: URI or remote) to a Gemini
 * inlineData part ({inlineData: {mimeType, data}}).
 *
 * Handles data: URIs (base64 already encoded) and remote URLs (fetched and
 * base64-encoded via btoa). Returns null on any failure so callers can skip
 * unreadable images without aborting the whole request.
 *
 * @param {string} url - data:image/...;base64,... or a remote image URL
 * @returns {Promise<{inlineData:{mimeType:string, data:string}}|null>}
 */
async function imageToInlineData(url) {
  if (!url) return null;
  try {
    let base64Data;
    let mimeType = 'image/png';
    if (url.startsWith('data:image/')) {
      const [header, data] = url.split(',');
      if (data) {
        base64Data = data;
        const mimeMatch = header.match(/data:([^;]+)/);
        if (mimeMatch) mimeType = mimeMatch[1];
      }
    } else {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        // Chunked base64 encoding: btoa(String.fromCharCode.apply(null, ...))
        // throws RangeError (stack overflow) on buffers >~512KB-1MB. Encode in
        // 8KB chunks to stay within the apply-argument limit for any image size.
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        }
        base64Data = btoa(binary);
        mimeType = blob.type || 'image/png';
      }
    }
    if (base64Data) {
      return { inlineData: { mimeType: mimeType, data: base64Data } };
    }
  } catch (e) {
    // Skip unreadable image; return null so caller continues with other images
  }
  return null;
}
