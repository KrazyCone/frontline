/** Normalise country names so "Dem. Rep. Congo", "Democratic Republic of the Congo" and "DR Congo" compare equal. */
export function normCountry(s: string) {
  return s
    .toLowerCase()
    .replace(/türkiye/g, 'turkey')
    .replace(/\bdr congo\b|\bdrc\b/g, 'democratic republic congo')
    .replace(/\bdem\.?\s/g, 'democratic ')
    .replace(/\brep\.?(?=\s|$)/g, 'republic')
    .replace(/\bs\.\s?/g, 'south ')
    .replace(/\bn\.\s?/g, 'north ')
    .replace(/\bw\.\s?/g, 'western ')
    .replace(/\be\.\s?/g, 'eastern ')
    .replace(/\beq\.\s?/g, 'equatorial ')
    .replace(/russian federation/g, 'russia')
    .replace(/united states of america/g, 'united states')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\b(of|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const sameCountry = (a: string, b: string) => normCountry(a) === normCountry(b);
