export function inlineCode(value: unknown) {
  const text = (typeof value === 'string' ? value : 'Not configured').trim() || 'Not configured';
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), match => match[0].length),
  );
  const delimiter = '`'.repeat(longestBacktickRun + 1);

  // CommonMark code spans use a delimiter longer than any run contained in
  // the value. This safely preserves arbitrary backslashes and backticks
  // without relying on incomplete character-by-character escaping.
  return `${delimiter} ${text} ${delimiter}`;
}
