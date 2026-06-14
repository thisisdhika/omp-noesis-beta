/**
 * Lightweight token estimator for mixed ASCII/CJK/whitespace content.
 *
 * Approximates typical LLM tokenizer behaviour:
 * - CJK ideographs / syllabaries → ~2 tokens each
 * - ASCII / Latin characters → ~0.25 tokens each (≈ 4 chars/token)
 * - Whitespace → heavily discounted, tokenizers often merge it
 *   with adjacent content tokens.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (isCJK(code)) {
      tokens += 2;
    } else if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      tokens += 0.05;
    } else {
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

/** CJK code-point ranges covering unified ideographs, extensions,
 *  radicals, punctuation, Hiragana, Katakana, and Hangul Syllables. */
function isCJK(code: number): boolean {
  return (
    (code >= 0x2E80 && code <= 0x2EFF) ||  // CJK Radicals Supplement
    (code >= 0x3000 && code <= 0x303F) ||  // CJK Symbols and Punctuation
    (code >= 0x3040 && code <= 0x309F) ||  // Hiragana
    (code >= 0x30A0 && code <= 0x30FF) ||  // Katakana
    (code >= 0x31F0 && code <= 0x31FF) ||  // Katakana Phonetic Extensions
    (code >= 0x3200 && code <= 0x32FF) ||  // Enclosed CJK
    (code >= 0x3400 && code <= 0x4DBF) ||  // CJK Unified Extension A
    (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified Ideographs
    (code >= 0xAC00 && code <= 0xD7AF) ||  // Hangul Syllables
    (code >= 0xF900 && code <= 0xFAFF) ||  // CJK Compatibility Ideographs
    (code >= 0xFE30 && code <= 0xFE4F)     // CJK Compatibility Forms
  );
}
