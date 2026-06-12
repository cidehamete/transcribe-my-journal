// mistral.js
// Lightweight wrapper for calling the Mistral vision model via fetch

import { DEFAULT_SYSTEM_PROMPT } from './prompt.js';

export async function transcribeImage(dataUrl, apiKey, model = 'pixtral-large-latest', prompt = '', maxTokens = 2000, prevPageTail = '') {
  let userText = 'Transcribe the handwritten journal page in this image, following your instructions exactly. The page may begin and end mid-sentence.';
  if (prevPageTail) {
    userText += `\n\nFor continuity, the previous page's transcript ended with:\n"...${prevPageTail}"\n\nThis page likely continues that sentence. Do NOT repeat the previous page's text — transcribe only what is on this page.`;
  }

  const payload = {
    model,
    max_tokens: parseInt(maxTokens),
    temperature: 0.2, // low temperature = more faithful transcription
    messages: [
      {
        role: 'system',
        content: prompt || DEFAULT_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userText,
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl, // pass full data URL (base64)
            },
          },
        ],
      },
    ],
  };

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const errJson = await res.json();
      detail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      detail = await res.text();
    }
    throw new Error(`Mistral API error: ${res.status} ${res.statusText}: ${detail}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() || '';
  return text;
}
