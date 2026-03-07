import { loadPdfAsImages } from './pdf_renderer.js';
import { getConfig, saveConfig, clearApiKey } from './storage.js';
import { transcribeImage } from './openai.js';
import { exportTxt } from './exporter.js';

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const pasteTextBtn = document.getElementById('pasteTextBtn');
const dropOverlay = document.getElementById('dropOverlay');
const pageCanvas = document.getElementById('pageCanvas');
const transcriptArea = document.getElementById('transcriptArea');
const exportBtn = document.getElementById('exportBtn');

// New simplified UI elements
const emptyState = document.getElementById('emptyState');
const imagePane = document.getElementById('imagePane');
const transcriptPane = document.getElementById('transcriptPane');
const viewToggle = document.getElementById('viewToggle');
const showImageBtn = document.getElementById('showImageBtn');
const showTranscriptBtn = document.getElementById('showTranscriptBtn');
const pageNavigation = document.getElementById('pageNavigation');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');
const batchTranscribeBtn = document.getElementById('batchTranscribeBtn');
const toggleAutoTranscribeBtn = document.getElementById('toggleAutoTranscribeBtn');
const improveTextBtn = document.getElementById('improveTextBtn');
const improveAllTextBtn = document.getElementById('improveAllTextBtn');

// Status overlay elements
const statusOverlay = document.getElementById('statusOverlay');
const statusText = document.getElementById('statusText');
function showStatus(message = 'Processing…') {
  statusText.textContent = message;
  statusOverlay.classList.remove('hidden');
}
function hideStatus() {
  statusOverlay.classList.add('hidden');
}

// Settings dialog elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelInput = document.getElementById('modelInput');
const promptInput = document.getElementById('promptInput');
const resetKeyBtn = document.getElementById('resetKeyBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const compressImagesCheckbox = document.getElementById('compressImagesCheckbox');
const maxTokensSelect = document.getElementById('maxTokensSelect');

// Paste text modal elements
const pasteTextModal = document.getElementById('pasteTextModal');
const pasteTextArea = document.getElementById('pasteTextArea');
const closePasteModal = document.getElementById('closePasteModal');
const cancelPasteBtn = document.getElementById('cancelPasteBtn');
const processPasteBtn = document.getElementById('processPasteBtn');

let state = {
  project: null, // { title, pages: [...] }
  currentPageIndex: 0,
  currentView: 'image', // 'image' or 'transcript'
  autoTranscribeDisabled: false,
  batchTranscribing: false,
  isTextOnly: false, // true when working with uploaded text files
};

function updatePageNavigation() {
  if (!state.project || state.project.pages.length <= 1) {
    pageNavigation.classList.add('hidden');
    return;
  }

  pageNavigation.classList.remove('hidden');
  pageIndicator.textContent = `Page ${state.currentPageIndex + 1} of ${state.project.pages.length}`;
  prevPageBtn.disabled = state.currentPageIndex === 0;
  nextPageBtn.disabled = state.currentPageIndex === state.project.pages.length - 1;
}

function showPage(pageIndex) {
  if (!state.project || pageIndex < 0 || pageIndex >= state.project.pages.length) return;

  state.currentPageIndex = pageIndex;
  const page = state.project.pages[pageIndex];

  if (state.isTextOnly) {
    // Text-only mode: hide image, show transcript directly
    pageCanvas.classList.add('hidden');
    emptyState.classList.add('hidden');
    viewToggle.classList.add('hidden');
    transcriptPane.classList.remove('hidden');
    imagePane.classList.add('hidden');
    state.currentView = 'transcript';
  } else {
    // Image mode: show image and toggle
    drawImageOnCanvas(page.image);
    pageCanvas.classList.remove('hidden');
    emptyState.classList.add('hidden');
    viewToggle.classList.remove('hidden');

    // Auto-transcribe if no transcript exists and user hasn't disabled auto-transcribe
    if (!page.transcript && page.status === 'pending' && !state.autoTranscribeDisabled) {
      transcribeCurrentPage();
    }
  }

  // Update transcript area
  transcriptArea.value = page.transcript || '';

  updatePageNavigation();
  updateView();
}

function updateView() {
  if (state.currentView === 'image') {
    imagePane.classList.remove('hidden');
    transcriptPane.classList.add('hidden');
    showImageBtn.classList.add('active');
    showTranscriptBtn.classList.remove('active');
  } else {
    imagePane.classList.add('hidden');
    transcriptPane.classList.remove('hidden');
    showImageBtn.classList.remove('active');
    showTranscriptBtn.classList.add('active');
  }
}

function drawImageOnCanvas(img) {
  const ctx = pageCanvas.getContext('2d');
  pageCanvas.width = img.width;
  pageCanvas.height = img.height;
  ctx.drawImage(img, 0, 0);
}

async function handlePastedText(text) {
  exportBtn.disabled = true;
  showStatus('Processing pasted text...');

  try {
    const pages = splitTextIntoPages(text);
    const pagesData = pages.map((pageText) => ({
      image: null,
      transcript: pageText,
      status: 'done',
      originalText: pageText,
    }));

    state.isTextOnly = true;

    state.project = {
      title: `Pasted Text`,
      pages: pagesData,
    };

    state.currentPageIndex = 0;
    updatePageNavigation();
    updateUIForFileType();
    showPage(0);
    hideStatus();
    exportBtn.disabled = false;

  } catch (error) {
    hideStatus();
    console.error('Error processing pasted text:', error);
    alert('Error processing the pasted text. Please try again.');
  }
}

async function handleFiles(files) {
  exportBtn.disabled = true;
  const file = files[0];
  if (!file) return;

  showStatus('Loading file...');

  let pagesData = [];
  state.isTextOnly = false;

  try {
    if (file.type === 'text/plain') {
      // Handle text files
      const text = await file.text();
      const pages = splitTextIntoPages(text);
      pagesData = pages.map((pageText) => ({
        image: null,
        transcript: pageText,
        status: 'done',
        originalText: pageText,
      }));
      state.isTextOnly = true;

    } else if (file.type === 'application/pdf') {
      try {
        const images = await loadPdfAsImages(file);
        pagesData = images.map((img) => ({ image: img, transcript: '', status: 'pending' }));
      } catch (pdfError) {
        hideStatus();
        console.error('PDF loading error:', pdfError);
        alert('Error loading PDF. Please try uploading an image or text file instead.');
        return;
      }
    } else if (file.type.startsWith('image/')) {
      const imgUrl = URL.createObjectURL(file);
      const img = await loadImage(imgUrl);
      pagesData = [{ image: img, transcript: '', status: 'pending' }];
    } else {
      hideStatus();
      alert('Unsupported file type. Please upload a PDF, image (JPG, PNG), or text file (.txt).');
      return;
    }

    state.project = {
      title: file.name,
      pages: pagesData,
    };

    hideStatus();
    updateUIForFileType();
    showPage(0);
    exportBtn.disabled = false;
  } catch (error) {
    hideStatus();
    console.error('Error loading file:', error);
    alert('Error loading file. Please try again or use a different file format.');
  }
}

function splitTextIntoPages(text, wordsPerPage = 500) {
  const words = text.split(/\s+/);
  const pages = [];

  for (let i = 0; i < words.length; i += wordsPerPage) {
    const pageWords = words.slice(i, i + wordsPerPage);
    pages.push(pageWords.join(' '));
  }

  return pages.length > 0 ? pages : [text];
}

function updateUIForFileType() {
  if (state.isTextOnly) {
    // Hide image-related controls, show text improvement controls
    batchTranscribeBtn.classList.add('hidden');
    toggleAutoTranscribeBtn.classList.add('hidden');
    improveTextBtn.classList.remove('hidden');
    improveAllTextBtn.classList.remove('hidden');

    // Update page indicator text
    if (state.project.pages.length > 1) {
      pageIndicator.textContent = `Section ${state.currentPageIndex + 1} of ${state.project.pages.length}`;
    }
  } else {
    // Show image-related controls, hide text improvement
    batchTranscribeBtn.classList.remove('hidden');
    toggleAutoTranscribeBtn.classList.remove('hidden');
    improveTextBtn.classList.add('hidden');
    improveAllTextBtn.classList.add('hidden');
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function compressCanvas(canvas, quality = 0.7) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

async function getOptimizedImageData(canvas, compressImages = true) {
  if (!compressImages) {
    return canvas.toDataURL('image/png');
  }

  // Compress image to reduce token usage
  const blob = await compressCanvas(canvas, 0.7);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function transcribeCurrentPage() {
  const config = await getConfig();
  if (!config.apiKey) {
    alert('Please set your OpenAI API key in Settings first.');
    return;
  }

  const page = state.project.pages[state.currentPageIndex];
  page.status = 'working';
  showStatus(`Transcribing page ${state.currentPageIndex + 1}…`);

  try {
    const dataUrl = await getOptimizedImageData(pageCanvas, config.compressImages);
    const text = await transcribeImage(dataUrl, config.apiKey, config.model, config.prompt, config.maxTokens);
    page.transcript = text;
    page.status = 'done';
    transcriptArea.value = text;

    hideStatus();

    // Switch to transcript view to show result
    state.currentView = 'transcript';
    updateView();
  } catch (err) {
    console.error(err);
    alert('Failed to transcribe page. Please check your API key and try again.');
    hideStatus();
    page.status = 'pending';
  }
}

// Settings
settingsBtn.addEventListener('click', async () => {
  const config = await getConfig();
  apiKeyInput.value = config.apiKey || '';
  modelInput.value = config.model || 'gpt-4o-mini';
  promptInput.value = config.prompt || promptInput.value;
  compressImagesCheckbox.checked = config.compressImages !== false; // default true
  maxTokensSelect.value = config.maxTokens || '1000';
  settingsDialog.showModal();
});

settingsDialog.addEventListener('submit', (e) => {
  e.preventDefault();
  saveConfig({
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    prompt: promptInput.value.trim(),
    compressImages: compressImagesCheckbox.checked,
    maxTokens: maxTokensSelect.value,
  });
  settingsDialog.close();
});

resetKeyBtn.addEventListener('click', () => {
  clearApiKey();
  apiKeyInput.value = '';
  alert('API key cleared from browser storage.');
});

closeSettingsBtn.addEventListener('click', () => settingsDialog.close());

// Upload & drag-drop
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

// Paste text functionality
pasteTextBtn.addEventListener('click', () => {
  pasteTextArea.value = '';
  pasteTextModal.classList.remove('hidden');
  pasteTextArea.focus();
});

closePasteModal.addEventListener('click', () => {
  pasteTextModal.classList.add('hidden');
});

cancelPasteBtn.addEventListener('click', () => {
  pasteTextModal.classList.add('hidden');
});

processPasteBtn.addEventListener('click', () => {
  const text = pasteTextArea.value.trim();
  if (text) {
    handlePastedText(text);
    pasteTextModal.classList.add('hidden');
  }
});

// Close modal when clicking outside
pasteTextModal.addEventListener('click', (e) => {
  if (e.target === pasteTextModal) {
    pasteTextModal.classList.add('hidden');
  }
});

// Handle Ctrl+V/Cmd+V shortcut
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    pasteTextBtn.click();
  }

  // Close modal with Escape key
  if (e.key === 'Escape' && !pasteTextModal.classList.contains('hidden')) {
    pasteTextModal.classList.add('hidden');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('hidden');
});

document.addEventListener('dragleave', (e) => {
  if (e.target === document) dropOverlay.classList.add('hidden');
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('hidden');
  handleFiles(e.dataTransfer.files);
});

// Page navigation
prevPageBtn.addEventListener('click', () => {
  if (state.currentPageIndex > 0) {
    showPage(state.currentPageIndex - 1);
  }
});

nextPageBtn.addEventListener('click', () => {
  if (state.currentPageIndex < state.project.pages.length - 1) {
    showPage(state.currentPageIndex + 1);
  }
});

// View toggle
showImageBtn.addEventListener('click', () => {
  state.currentView = 'image';
  updateView();
});

showTranscriptBtn.addEventListener('click', () => {
  state.currentView = 'transcript';
  updateView();
});

// Export current project
exportBtn.addEventListener('click', () => {
  if (!state.project) return;
  exportTxt(state.project.pages);
});

// Transcript area updates (make it editable)
transcriptArea.addEventListener('input', () => {
  if (!state.project) return;
  const page = state.project.pages[state.currentPageIndex];
  page.transcript = transcriptArea.value;
});

// Batch transcription
batchTranscribeBtn.addEventListener('click', async () => {
  if (!state.project || state.batchTranscribing) return;

  const config = await getConfig();
  if (!config.apiKey) {
    alert('Please set your OpenAI API key in Settings first.');
    return;
  }

  const pendingPages = state.project.pages.filter(p => !p.transcript || p.status === 'pending');
  if (pendingPages.length === 0) {
    alert('All pages are already transcribed!');
    return;
  }

  const confirmed = confirm(`This will transcribe ${pendingPages.length} pages. This may take several minutes and will use ${pendingPages.length} API calls. Continue?`);
  if (!confirmed) return;

  state.batchTranscribing = true;
  batchTranscribeBtn.disabled = true;
  batchTranscribeBtn.textContent = 'Transcribing...';

  let completed = 0;
  for (let i = 0; i < state.project.pages.length; i++) {
    const page = state.project.pages[i];
    if (page.transcript && page.status === 'done') continue;

    showStatus(`Transcribing page ${i + 1} of ${state.project.pages.length}... (${completed + 1}/${pendingPages.length})`);

    try {
      // Switch to this page to show progress
      showPage(i);

      // Generate optimized data URL for this page
      const dataUrl = await getOptimizedImageData(pageCanvas, config.compressImages);
      const text = await transcribeImage(dataUrl, config.apiKey, config.model, config.prompt, config.maxTokens);

      page.transcript = text;
      page.status = 'done';
      completed++;

      // Update transcript area if this is the current page
      if (state.currentPageIndex === i) {
        transcriptArea.value = text;
      }

      // Small delay to prevent API rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (err) {
      console.error(`Error transcribing page ${i + 1}:`, err);
      page.status = 'error';
      // Continue with other pages
    }
  }

  hideStatus();
  state.batchTranscribing = false;
  batchTranscribeBtn.disabled = false;
  batchTranscribeBtn.textContent = 'Transcribe All Pages';

  alert(`Batch transcription complete! Successfully transcribed ${completed} pages.`);
});

// Toggle auto-transcribe
toggleAutoTranscribeBtn.addEventListener('click', () => {
  state.autoTranscribeDisabled = !state.autoTranscribeDisabled;
  toggleAutoTranscribeBtn.textContent = `Auto-transcribe: ${state.autoTranscribeDisabled ? 'OFF' : 'ON'}`;

  if (state.autoTranscribeDisabled) {
    toggleAutoTranscribeBtn.classList.add('btn-warning');
    toggleAutoTranscribeBtn.classList.remove('btn-secondary');
  } else {
    toggleAutoTranscribeBtn.classList.remove('btn-warning');
    toggleAutoTranscribeBtn.classList.add('btn-secondary');
  }
});

// Text improvement for current section
improveTextBtn.addEventListener('click', async () => {
  if (!state.project || !state.isTextOnly) return;

  const { apiKey, model, prompt } = await getConfig();
  if (!apiKey) {
    alert('Please set your OpenAI API key in Settings first.');
    return;
  }

  const currentPage = state.project.pages[state.currentPageIndex];
  if (!currentPage.transcript) {
    alert('No text to improve on this section.');
    return;
  }

  const confirmed = confirm('This will use AI to clean up the current section\'s transcription errors and formatting. Continue?');
  if (!confirmed) return;

  improveTextBtn.disabled = true;
  improveTextBtn.textContent = 'Improving...';
  showStatus('Improving current section...');

  try {
    const improvedText = await improveText(currentPage.transcript, apiKey, model, prompt);
    currentPage.transcript = improvedText;
    transcriptArea.value = improvedText;

    hideStatus();
    alert('Section improvement complete!');
  } catch (err) {
    console.error('Text improvement error:', err);
    alert('Failed to improve text. Please check your API key and try again.');
    hideStatus();
  }

  improveTextBtn.disabled = false;
  improveTextBtn.textContent = 'Improve Current Section';
});

// Improve entire document
improveAllTextBtn.addEventListener('click', async () => {
  if (!state.project || !state.isTextOnly) return;

  const { apiKey, model, prompt } = await getConfig();
  if (!apiKey) {
    alert('Please set your OpenAI API key in Settings first.');
    return;
  }

  const sectionsToImprove = state.project.pages.filter(p => p.transcript && p.transcript.trim());
  if (sectionsToImprove.length === 0) {
    alert('No text sections found to improve.');
    return;
  }

  const confirmed = confirm(`This will clean up all ${sectionsToImprove.length} sections of the document. This may take several minutes and will use ${sectionsToImprove.length} API calls. Continue?`);
  if (!confirmed) return;

  improveAllTextBtn.disabled = true;
  improveAllTextBtn.textContent = 'Improving...';

  let completed = 0;
  for (let i = 0; i < state.project.pages.length; i++) {
    const page = state.project.pages[i];
    if (!page.transcript || !page.transcript.trim()) continue;

    showStatus(`Improving section ${completed + 1} of ${sectionsToImprove.length}...`);

    try {
      if (state.currentPageIndex !== i) {
        showPage(i);
      }

      const improvedText = await improveText(page.transcript, apiKey, model, prompt);
      page.transcript = improvedText;
      completed++;

      if (state.currentPageIndex === i) {
        transcriptArea.value = improvedText;
      }

      // Small delay to prevent API rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (err) {
      console.error(`Error improving section ${i + 1}:`, err);
      // Continue with other sections
    }
  }

  hideStatus();
  improveAllTextBtn.disabled = false;
  improveAllTextBtn.textContent = 'Improve Entire Document';

  alert(`Document improvement complete! Successfully improved ${completed} sections.`);
});

async function improveText(text, apiKey, model = 'gpt-4o-mini', customPrompt = null) {
  const defaultSystemPrompt = `You are an expert editor who cleans up badly transcribed or OCR'd handwritten journal entries.

The text you receive may contain these transcription errors:
- Artificial line breaks in the middle of sentences (join them into natural flowing sentences)
- Stray symbols like '#', '*', '/' inserted where letters or words should be (e.g. "#apped" → "napped", "#a/so" → "also")
- Words split across line breaks, sometimes with a hyphen (e.g. "meme-ab re" → "memorable", "memo-ra ble" → "memorable")
- Words run together at line boundaries (e.g. "speakor" → "speak or", "theword" → "the word")
- Letters visually confused (e.g. "feet" → "feel", "tract" → "track", "hes" → "this")
- Missing spaces, inconsistent capitalization, missing punctuation

Your task:
1. Use context clues to reconstruct what the author actually wrote
2. Fix punctuation and capitalization
3. Add natural paragraph breaks for readability
4. Preserve the author's exact voice, style, word choices, and sentence structure — do not rephrase or improve the prose itself
5. Return only the corrected text, nothing else`;

  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content: customPrompt || defaultSystemPrompt,
      },
      {
        role: 'user',
        content: `Clean up this badly transcribed journal text:\n\n${text}`,
      },
    ],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
    throw new Error(`OpenAI API error: ${res.status} ${res.statusText}: ${detail}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || text;
}

// Remove readonly from transcript area
transcriptArea.removeAttribute('readonly');
