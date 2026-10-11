import { formatCompact, formatCount, formatDuration } from "./format";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { owned, tierById } from "./tiers";
import { synergyBonus, upgradeLevel, type Upgrade } from "./upgrades";

// Player-facing wording shared by the screen's panels.

/** Away pay as a percentage people read, e.g. "30%" or "37.5%". */
export const percent = (share: number): string =>
  `${String(Number((share * 100).toFixed(1)))}%`;

/** Away pay can grow (Steady hands), so the copy reads the live rate. */
export const restingPace = (mountain: Mountain): string =>
  `at a resting pace (${percent(effectiveRates(mountain).awayPay)} of their speed)`;

/** Per-unit speed: one decimal while small and fractional (Better boots). */
export const formatSpeed = (speed: number): string =>
  speed < 10 && !Number.isInteger(speed)
    ? speed.toFixed(1)
    : formatCompact(speed);

/** 9:05, or 1:02:03 past an hour. */
export const formatClock = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${String(minutes)}:${seconds}`;
};

/** What the upgrade does for this crew right now. */
/** "Your 12 helpers make carts 12% faster." — or would, before it's bought. */
const synergyNow = (upgrade: Upgrade, mountain: Mountain): string => {
  if (upgrade.synergy === undefined) {
    return "";
  }
  const from = tierById(upgrade.synergy.from);
  const to = tierById(upgrade.synergy.to);
  const count = owned(mountain, from);
  if (count === 0) {
    return "";
  }
  const plural =
    count === 1 ? from.name.toLowerCase() : `${from.name.toLowerCase()}s`;
  const target =
    to.id === "machine"
      ? "the Great Machine"
      : `${to.shortName.toLowerCase()}s`;
  const bonus = percent(synergyBonus(mountain, upgrade));
  return upgradeLevel(mountain, upgrade.id) > 0
    ? `Your ${String(count)} ${plural} make ${target} ${bonus} faster.`
    : `Your ${String(count)} ${plural} would make ${target} ${bonus} faster.`;
};

export const upgradeNow = (
  upgrade: Upgrade,
  mountain: Mountain,
  at: number,
): string => {
  const rates = effectiveRates(mountain, at);
  switch (upgrade.id) {
    case "tap":
      return `Each tap now mines ${formatCount(rates.tapYield)}.`;
    case "boots":
      return `Each helper now mines ${formatSpeed(rates.tierSpeed.helper)}/s.`;
    case "steady":
      return `Time away now pays ${percent(rates.awayPay)} of crew speed.`;
    case "cartSyn":
    case "drillSyn":
    case "borerSyn":
    case "machineSyn":
      return synergyNow(upgrade, mountain);
  }
};

export const unlockWords = (upgrade: Upgrade): string => {
  if (upgrade.unlock === undefined) {
    return "Locked";
  }
  const tier = tierById(upgrade.unlock.tier);
  if (tier.id === "machine") {
    return "Unlocks with the Great Machine";
  }
  return upgrade.unlock.count === 1
    ? `Unlocks with your first ${tier.name.toLowerCase()}`
    : `Unlocks at ${String(upgrade.unlock.count)} ${tier.name.toLowerCase()}s`;
};

/** "the first 8 hours", or "a whole day" once the Shield lifts the cap. */
export const capWords = (capMs: number): string =>
  capMs >= 24 * 3_600_000
    ? "a whole day"
    : `the first ${formatDuration(capMs)}`;

export const tapWords = (stones: number): string =>
  stones === 1 ? "one stone" : `${formatCount(stones)} stones`;
