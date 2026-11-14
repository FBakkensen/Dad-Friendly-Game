/**
 * `--factors a=1,recipe.iron-rails.cost=0.5` as a sweep factor map, for both
 * labs (#534). Undefined when the text is empty or a pair is not id=number,
 * so a lab can refuse a bad pair instead of running with it.
 */
export function parseFactors(
  text: string | undefined,
): Readonly<Record<string, number>> | undefined {
  if (text === undefined || text.trim() === "") {
    return undefined;
  }
  const factors: Record<string, number> = {};
  for (const pair of text.split(",")) {
    const [id = "", value = "", ...rest] = pair.trim().split("=");
    const number = Number(value);
    if (
      rest.length > 0 ||
      !/^[\w.-]+$/.test(id) ||
      value.trim() === "" ||
      !Number.isFinite(number)
    ) {
      return undefined;
    }
    factors[id] = number;
  }
  return factors;
}
