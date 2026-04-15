export function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const sanitize = (val: string) => {
    // Prevenir CSV injection: prefixar con apóstrofe si empieza con caracteres peligrosos
    if (/^[=+\-@\t\r]/.test(val)) {
      val = `'${val}`;
    }
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csv = [headers.map(sanitize).join(','), ...rows.map((row) => row.map(sanitize).join(','))].join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
