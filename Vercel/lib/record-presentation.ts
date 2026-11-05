import type { PublicRecord } from './generated-contract';

/** Remove recognized file packaging only; the original title remains in the record. */
export function recordDisplayTitle(title: string): string {
  const withoutExtension = title.replace(/\.(?:jpe?g|png|gif|tiff?|webp|pdf|mp[34]|wav|ogg)$/i, '');
  const cleaned = withoutExtension
    .replace(/\s+-\s+DPLA\s+-\s+[a-f0-9]{32}(?:\s+\(page\s+\d+\))?$/i, '')
    .replace(/\s+-\s+NARA\s+-\s+\d+$/i, '')
    .trim();
  return cleaned || title;
}

export function recordDateLabel(record: Pick<PublicRecord, 'dates'>): string {
  return record.dates.precision === 'unknown' ? '시기 미상' : record.dates.display;
}

export function recordLanguageLabel(language: string): string {
  const names: Record<string, string> = { und: '언어 미상', ko: '한국어', en: '영어', ja: '일본어', zh: '중국어', de: '독일어', fr: '프랑스어', es: '스페인어', ru: '러시아어' };
  return names[language.toLowerCase()] ?? language;
}
