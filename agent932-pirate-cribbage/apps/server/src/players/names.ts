import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * Whether a username contains a swear word or slur. Underscores and CamelCase are split as well,
 * so "f_u_c_k" and "BigSwearWord" are caught; the word list allows innocent names that only
 * contain one (Scunthorpe, Cockburn).
 */
export function isOffensiveName(name: string): boolean {
  const variants = [
    name,
    name.replace(/_/g, ""),
    name.replace(/_/g, " "),
    name.replace(/([a-z])([A-Z])/g, "$1 $2"),
  ];
  return variants.some((v) => matcher.hasMatch(v));
}
