/** How the owner's Signals numbers are written on a phone: plain words, no jargon. */

export interface AskedPaid { asked: number; paid: number }

const NAMES: Record<string, string> = {
  "site-pass": "Website visit pass",
  vendors: "Vendor lookup (removed)",
  facts: "Plans and prices facts",
  blog: "Blog article copy",
};

export const productName = (id: string): string => NAMES[id] ?? id;

const times = (n: number) => (n === 1 ? "once" : `${n} times`);

export function askedAndPaid(c: AskedPaid): string {
  if (c.asked <= 0) return "Nobody has asked yet";
  if (c.paid <= 0) return `Asked ${times(c.asked)}, nobody paid`;
  return `Asked ${times(c.asked)}, ${c.paid} paid (${Math.round((c.paid / c.asked) * 100)}%)`;
}

/** The products that were asked for at all, most asked first. */
export function rows(products: Record<string, AskedPaid>): { id: string; name: string; text: string }[] {
  return Object.entries(products)
    .filter(([, c]) => c.asked > 0)
    .sort((a, b) => b[1].asked - a[1].asked || a[0].localeCompare(b[0]))
    .map(([id, c]) => ({ id, name: productName(id), text: askedAndPaid(c) }));
}
