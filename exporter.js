// exporter.js

export function exportTxt(pages) {
  const text = pages
    .map((p, idx) => `Page ${idx + 1}\n\n${p.transcript || ''}\n`)
    .join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcript.txt';
  a.click();
  URL.revokeObjectURL(url);
}
