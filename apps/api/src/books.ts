import { readFileSync } from "node:fs";

/**
 * The books sold to AI agents as PDFs. Written in books/src/*.md and built by scripts/build-books.mjs; the PDFs and the
 * manifest are committed so the server never needs a browser. A test fails if a book's text changes without a rebuild.
 */
export interface Book {
  slug: string; title: string; subtitle: string; description: string; language: string;
  pages: number; bytes: number; sha256: string; sourceSha256: string; file: string;
  /** Only when this book is priced differently from the rest; the book's source says so in a `price` comment. */
  price?: string;
}

const dir = new URL("../books/", import.meta.url);
export const BOOKS: Book[] = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));

/** The PDF's bytes, or undefined for a name that is not a book. Only names in the manifest are ever read from disk. */
export function readBook(slug: string): Buffer | undefined {
  const book = BOOKS.find((b) => b.slug === slug);
  return book ? readFileSync(new URL(book.file, dir)) : undefined;
}
