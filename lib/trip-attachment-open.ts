function isPdfFile(fileName: string, fileType?: string | null): boolean {
  const type = (fileType || '').toLowerCase();
  const name = fileName.toLowerCase();
  return type.includes('pdf') || name.endsWith('.pdf');
}

function isImageFile(fileName: string, fileType?: string | null): boolean {
  const type = (fileType || '').toLowerCase();
  const name = fileName.toLowerCase();
  return type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(name);
}

export function openTripAttachment(params: {
  downloadUrl: string;
  fileName: string;
  fileType?: string | null;
}): void {
  const { downloadUrl, fileName, fileType } = params;
  if (isPdfFile(fileName, fileType) || isImageFile(fileName, fileType)) {
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
