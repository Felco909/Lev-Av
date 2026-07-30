/**
 * Единый способ формирования заголовка Content-Disposition (аудит, п.5) — раньше в разных
 * генераторах документов имя файла кодировалось по-разному: где-то только
 * `filename="${encodeURIComponent(...)}"` (не RFC 5987 форма — некоторые браузеры сохраняют
 * файл буквально как %D0%A1..., не раскодировав кириллицу), где-то только
 * `filename*=UTF-8''...` без ASCII-фолбэка, где-то дублирующийся локальный asciiFileName().
 * Теперь везде одна функция — RFC 5987 (filename + filename*), с ASCII-фолбэком для
 * старых клиентов без поддержки filename*.
 */
function asciiFallback(name: string): string {
  const cleaned = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_').trim();
  return cleaned || 'file';
}

export function buildContentDisposition(disposition: 'inline' | 'attachment', fileName: string): string {
  return `${disposition}; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
