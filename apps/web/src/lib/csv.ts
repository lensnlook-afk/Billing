/**
 * Generate and download a CSV file in the browser.
 *
 * @param filename  e.g. "sales-2026-10-24.csv"
 * @param headers   column header strings
 * @param rows      array of row arrays (values coerced to string)
 */
export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (val: string | number | null | undefined) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows]
    .map(r => r.map(escape).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
