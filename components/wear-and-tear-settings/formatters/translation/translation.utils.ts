const TRANSLATION_KEY_PATTERN = /^__TRANSLATION__\.[A-Z0-9_.!?]+$/;

export function isTranslationKey(value: string): boolean {
  return TRANSLATION_KEY_PATTERN.test(value);
}

export function trimNamespace(value: string): string {
  return value.replace(/^__TRANSLATION__\./, '');
}
