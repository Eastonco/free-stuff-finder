// What to do with one new post for one search. Pure: classification is passed
// in, so this runs the same in the worker, a CLI, or a test.
import { isExcluded } from "./filter";
import type { Verdict } from "./types";

export type MatchSearch = {
  /** First time this search's URLs have been scraped: record a baseline, don't alert or classify. */
  isBaseline: boolean;
  excludeFilters: readonly string[];
};

export type MatchDecision =
  | { kind: "baseline" }
  | { kind: "excluded"; verdict: Verdict }
  | { kind: "classified"; verdict: Verdict; alert: boolean };

export async function decideMatch(opts: {
  title: string;
  search: MatchSearch;
  classify: () => Promise<Verdict>;
  /** False once too many classifications have failed recently (see createFailureWindow). */
  allowFailOpenAlerts: boolean;
}): Promise<MatchDecision> {
  const { title, search, classify, allowFailOpenAlerts } = opts;

  if (search.isBaseline) return { kind: "baseline" };

  if (isExcluded(title, search.excludeFilters)) {
    return { kind: "excluded", verdict: { label: "skip", score: 0, reason: "excluded by filter" } };
  }

  const verdict = await classify();
  const alert = verdict.label === "want" && (!verdict.error || allowFailOpenAlerts);
  return { kind: "classified", verdict, alert };
}
