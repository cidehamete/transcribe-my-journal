// exporter.js

export function exportTxt(pages) {
  const isTextOnly = pages.every(p => !p.image);
  const sourceFiles = [...new Set(pages.filter(p => p.sourceFile).map(p => p.sourceFile))];
  const multipleFiles = sourceFiles.length > 1;

  let text;

  if (isTextOnly) {
    // Text mode: clean output, no page numbers
    if (multipleFiles) {
      // Multiple source files: add a separator between each file
      const parts = [];
      let currentFile = null;
      pages.forEach((p) => {
        if (p.sourceFile && p.sourceFile !== currentFile) {
          currentFile = p.sourceFile;
          if (parts.length > 0) parts.push('\n\n');
          parts.push(`=== ${currentFile} ===\n\n`);
        }
        if (p.transcript) parts.push(p.transcript);
      });
      text = parts.join('');
    } else {
      // Single file: just concatenate sections with a blank line between
      text = pages.map(p => p.transcript || '').filter(Boolean).join('\n\n');
    }
  } else {
    // Scan/image mode: include page numbers
    text = pages
      .map((p, idx) => `Page ${idx + 1}\n\n${p.transcript || ''}\n`)
      .join('\n');
  }

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = multipleFiles ? 'transcripts.txt' : 'transcript.txt';
  a.click();
  URL.revokeObjectURL(url);
}
