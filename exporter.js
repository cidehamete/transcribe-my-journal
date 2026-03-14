// exporter.js

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportTxt(pages) {
  const isTextOnly = pages.every(p => !p.image);
  const sourceFiles = [...new Set(pages.filter(p => p.sourceFile).map(p => p.sourceFile))];
  const multipleFiles = sourceFiles.length > 1;

  if (isTextOnly && multipleFiles) {
    // One download per source file, preserving original filenames
    sourceFiles.forEach((filename) => {
      const filePages = pages.filter(p => p.sourceFile === filename);
      const text = filePages.map(p => p.transcript || '').filter(Boolean).join('\n\n');
      downloadText(text, filename);
    });

  } else if (isTextOnly) {
    // Single text file: clean concatenation, no page numbers
    const text = pages.map(p => p.transcript || '').filter(Boolean).join('\n\n');
    const filename = pages[0]?.sourceFile || 'transcript.txt';
    downloadText(text, filename);

  } else {
    // Scan/image mode: include page numbers in one combined file
    const text = pages
      .map((p, idx) => `Page ${idx + 1}\n\n${p.transcript || ''}\n`)
      .join('\n');
    downloadText(text, 'transcript.txt');
  }
}
