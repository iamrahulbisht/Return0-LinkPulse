/**
 * Starts a browser download of a same-origin URL. The API sends `Content-Disposition: attachment`
 * for `?download=1`, so a temporary <a download> is enough; no blob or window.open needed.
 */
export function startDownload(url: string, fileName = ''): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
