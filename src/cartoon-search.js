import { escapeSearchRegex } from "./search-ranking.js";

/**
 * Build safe MongoDB title predicates for Cartoon search. The exact substring
 * handles partial words; the single-character wildcard alternatives tolerate
 * small typing mistakes, matching the normal catalogue search experience.
 */
export function buildCartoonSearchAlternatives(query, fields = ["title", "originalTitle", "aliases"]) {
  const value = String(query || "").trim().slice(0, 80);
  if (!value) return [];

  const exactPattern = new RegExp(escapeSearchRegex(value), "i");
  const alternatives = fields.map((field) => ({ [field]: exactPattern }));
  const fuzzyTokens = value.split(/\s+/).filter((token) => token.length >= 5 && token.length <= 24).slice(0, 3);
  const fuzzyPatterns = fuzzyTokens.flatMap((token) =>
    Array.from({ length: token.length }, (_, index) => new RegExp(
      escapeSearchRegex(token.slice(0, index)) + "." + escapeSearchRegex(token.slice(index + 1)),
      "i"
    ))
  );
  for (const field of fields) {
    for (const pattern of fuzzyPatterns) alternatives.push({ [field]: pattern });
  }
  return alternatives;
}
