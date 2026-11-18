// Token launch radar: the value model, the board builder and the farm plans.
//
// Everything here is derived from the sealed snapshot's own figures. No protocol
// name is hardcoded anywhere: a protocol is picked, valued and planned purely from
// its TVL, its 7-day change, its listing date, its chains, its category and whether
// its record carries a token.
//
// THE VALUE MODEL (impliedValue)
//   implied = TVL x 0.30 x growth x age x breadth, rounded to whole dollars.
//   - 0.30 is the base multiple: a launch's fully diluted value per dollar of TVL.
//   - growth rewards a rising TVL: 1 + clamp(change_7d, -50, +200) / 100 x 0.5,
//     so a protocol up 20% in a week scores 1.10 and one down 20% scores 0.90.
//     A missing change_7d scores 1.00 (no evidence either way).
//   - age rewards a long track record with no token: 1 + min(months listed, 36) x 0.008,
//     so two years of running token-free scores about 1.19. A missing listed_at scores 1.00.
//   - breadth rewards a multi-chain footprint: 1 + min(chains - 1, 8) x 0.01.
// The board ranks pre-token protocols by this value. Protocols whose token already
// trades are set aside into the dashboard's "already trading" list and never ranked
// as launch candidates.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ValueBreakdown {
  base_usd: number;
  growth_factor: number;
  age_factor: number;
  breadth_factor: number;
  age_days: number | null;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  watchlist: boolean;
  name_flag: string | null;
  value: ValueBreakdown;
}

export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
}

export interface RadarData {
  as_of: string;
  floor_usd: number;
  snapshot_size: number;
  pre_token_size: number;
  watchlist_size: number;
  live_size: number;
  set_aside_size: number;
  model: string;
  rows: BoardRow[];
  live: LiveRow[];
}

/** The board's target size: every watchlist protocol plus early ones below the floor. */
export const BOARD_TARGET = 200;

/** A protocol records no token when its record carries neither a CoinGecko id nor a ticker. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Categories the watchlist's rule treats as wrapped, staked or bridged products, or exchanges. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Why a protocol's name fails the watchlist's name rule, or null when it passes:
 * a version marker (V2, v3, 2.0), a wrapped/staked word, or an exchange's name first.
 */
export function nameFlag(p: SnapshotProtocol): string | null {
  if (VERSION_SUFFIX.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked name';
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return 'exchange name';
  return null;
}

/** A launch candidate: records no token, and not a wrapped, staked or bridged product. */
export function isCandidate(p: SnapshotProtocol): boolean {
  return recordsNoToken(p) && !EXCLUDED_CATEGORIES.has(p.category ?? '') && nameFlag(p) === null;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const DAY_MS = 86_400_000;

/** Whole days between the snapshot's date and the day DefiLlama began tracking the protocol. */
export function ageDays(p: SnapshotProtocol, asOfMs: number): number | null {
  if (p.listed_at === null) return null;
  const listed = Date.parse(`${p.listed_at}T00:00:00Z`);
  if (!Number.isFinite(listed)) return null;
  return Math.max(0, Math.floor((asOfMs - listed) / DAY_MS));
}

/**
 * The implied value of a protocol's launch, from its own figures, with the factors
 * that produced it so the dashboard can show the working.
 */
export function impliedValue(p: SnapshotProtocol, asOfMs: number): { value: number; breakdown: ValueBreakdown } {
  const age = ageDays(p, asOfMs);
  const months = age === null ? 0 : age / 30.4375;
  const growthFactor =
    p.change_7d === null ? 1 : 1 + (clamp(p.change_7d, -50, 200) / 100) * 0.5;
  const ageFactor = 1 + Math.min(months, 36) * 0.008;
  const breadthFactor = 1 + Math.min(Math.max(p.chains.length - 1, 0), 8) * 0.01;
  const base = p.tvl_usd * 0.3;
  const value = Math.max(1, Math.round(base * growthFactor * ageFactor * breadthFactor));
  return {
    value,
    breakdown: {
      base_usd: Math.round(base),
      growth_factor: growthFactor,
      age_factor: ageFactor,
      breadth_factor: breadthFactor,
      age_days: age,
    },
  };
}

// ---------------------------------------------------------------- farm plans

/** A typical gas cost for one transaction on a chain, as the farm steps quote it. */
const GAS: Record<string, string> = {
  Ethereum: '$3–$8',
  Solana: 'about $0.02',
  Base: 'about $0.05',
  Arbitrum: 'about $0.10',
  Optimism: 'about $0.10',
  Binance: 'about $0.15',
  Polygon: 'about $0.03',
  Avalanche: 'about $0.30',
  Sui: 'about $0.02',
  Aptos: 'about $0.03',
  Fantom: 'about $0.05',
  Gnosis: 'about $0.02',
  Linea: 'about $0.10',
  Scroll: 'about $0.10',
  zkSync: 'about $0.15',
  Mantle: 'about $0.05',
  Blast: 'about $0.05',
  Mode: 'about $0.05',
};

const gasOf = (chain: string): string => GAS[chain] ?? 'about $0.50';

/** The protocol's main chain: the first one the snapshot lists for it. */
const mainChain = (p: SnapshotProtocol): string => (p.chains.length > 0 ? p.chains[0]! : 'its home chain');

/** The core action for a category: what farming this kind of protocol actually means. */
function coreAction(p: SnapshotProtocol): { action: string; followUp: string } {
  const name = p.name;
  const chain = mainChain(p);
  switch (p.category) {
    case 'Dexs':
      return {
        action: `Swap $100–$500 of assets through ${name} on ${chain} in 2–3 trades, then add $100–$300 to a liquidity pool and hold the LP position. Each trade costs ${gasOf(chain)} in gas; allow 20 minutes.`,
        followUp: `Keep the LP position open and route one swap a week through ${name} so your address stays active. Each weekly swap costs ${gasOf(chain)}; about 10 minutes a week.`,
      };
    case 'Lending':
      return {
        action: `Supply $200–$1,000 of a major asset (ETH, USDC or wBTC) to ${name} on ${chain} and leave it earning for at least a month. Depositing costs ${gasOf(chain)} in gas; allow 15 minutes.`,
        followUp: `Borrow a small amount ($50–$200) against your supply once, repay it a week later, then repeat monthly so both sides of the market see your address. Each round trip costs ${gasOf(chain)} a step; 10 minutes a month.`,
      };
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
      return {
        action: `Deposit $100–$500 into ${name}'s highest-TVL vault on ${chain} and leave it compounding for at least 4 weeks. The deposit costs ${gasOf(chain)} in gas; allow 15 minutes.`,
        followUp: `Harvest or restake the vault's rewards once a week and top the deposit up by $50–$100 a month so the position grows. Each harvest costs ${gasOf(chain)}; about 10 minutes a week.`,
      };
    case 'Derivatives':
    case 'Basis Trading':
    case 'Leveraged Farming':
      return {
        action: `Open a small ($50–$200) low-leverage (2x or less) position on ${name} on ${chain} and hold it for at least a week. Opening costs ${gasOf(chain)} in gas plus the trading fee; allow 20 minutes.`,
        followUp: `Roll or re-open one position a week and keep total exposure under $500: the point is a steady trading history, not a big bet. Each trade costs ${gasOf(chain)} plus fees; 15 minutes a week.`,
      };
    case 'RWA':
    case 'Onchain Capital Allocator':
    case 'Risk Curators':
      return {
        action: `Deposit $200–$1,000 into ${name}'s main vault or allocation on ${chain} and hold for at least a month: these products reward patient capital. The deposit costs ${gasOf(chain)} in gas; allow 20 minutes.`,
        followUp: `Check the vault's reports once a week and add $100–$200 a month; a growing, long-held deposit is the strongest signal this kind of protocol reads. Each top-up costs ${gasOf(chain)}; 10 minutes a week.`,
      };
    case 'CDP':
    case 'CDP Manager':
      return {
        action: `Lock $200–$500 of collateral in ${name} on ${chain} and mint a modest amount of its stablecoin (under 50% of your collateral's value). Minting costs ${gasOf(chain)} in gas; allow 20 minutes.`,
        followUp: `Keep the position healthy for a month, repay part of the minted amount, then mint again: repeated, well-collateralised use is what counts. Each step costs ${gasOf(chain)}; 10 minutes a week.`,
      };
    case 'Staking Pool':
    case 'Restaking':
      return {
        action: `Stake $100–$500 with ${name} on ${chain} and leave it staked for at least a month, through at least one full reward cycle. Staking costs ${gasOf(chain)} in gas; allow 15 minutes.`,
        followUp: `Claim or restake rewards once a week and add a small amount ($25–$50) each month so the stake keeps growing. Each claim costs ${gasOf(chain)}; about 5 minutes a week.`,
      };
    case 'Chain':
      return {
        action: `Bridge $50–$200 to ${name} and use 2–3 of its native apps (a swap, a deposit, a mint) in the same week. Bridging costs ${gasOf(chain)} plus the bridge fee; allow 30 minutes.`,
        followUp: `Return once a week and use a different app each time: chains reward addresses that touch many of their apps, not one big deposit. Each visit costs ${gasOf(chain)} a transaction; 20 minutes a week.`,
      };
    case 'Prediction Market':
      return {
        action: `Place $20–$100 across 2–3 markets on ${name} on ${chain}, on outcomes you have actually researched, and hold to settlement. Each trade costs ${gasOf(chain)} in gas; allow 20 minutes.`,
        followUp: `Trade one new market a week and keep a simple log of wins and losses; steady participation across many markets beats one large bet. Each trade costs ${gasOf(chain)}; 15 minutes a week.`,
      };
    default:
      return {
        action: `Deposit or use $100–$500 with ${name} on ${chain} through its main product and leave the position open for at least a month. The first transaction costs ${gasOf(chain)} in gas; allow 20 minutes.`,
        followUp: `Use ${name} again once a week — a repeat deposit, a swap or a claim — so your address builds a steady history rather than a single visit. Each visit costs ${gasOf(chain)} a transaction; 10 minutes a week.`,
      };
  }
}

/**
 * A farm plan for one protocol: 5 concrete steps, each with what it costs and how
 * long it takes, written from the protocol's own category and chains.
 */
export function farmSteps(p: SnapshotProtocol): string[] {
  const chain = mainChain(p);
  const core = coreAction(p);
  const others = p.chains.length > 1 ? ` It also runs on ${p.chains.slice(1, 3).join(', ')}.` : '';
  return [
    `Set up a wallet funded on ${chain} with $100–$500 plus gas money (keep $10–$20 aside for fees). Funding costs ${gasOf(chain)} a transaction; allow 15 minutes to set up and fund.${others}`,
    core.action,
    core.followUp,
    `Check ${p.name}'s points, quests or rewards page once a week and finish any free task it lists (a social follow, a quiz, a referral) — these take 10 minutes a week and cost nothing but gas where a claim is onchain.`,
    `Size the whole position so you can leave it untouched for 3 months, review it monthly, and never deposit more than you can afford to lose: a token is never promised, so farm with money whose loss would not hurt.`,
  ];
}

// ---------------------------------------------------------------- the board

export function parseSnapshot(text: string): Snapshot {
  const data = JSON.parse(text) as Snapshot;
  if (!Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return data;
}

/**
 * Build the board: every watchlist protocol, then the highest-valued launch
 * candidates below the floor, up to BOARD_TARGET rows. When candidates run short,
 * the gap is filled with the highest-valued pre-token protocols whose names alone
 * fail the rule (a version marker or a wrapped/staked word), flagged as such.
 * Rows are ranked by implied value, ties broken by slug so the order is fixed.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const asOfMs = Date.parse(`${snapshot.as_of}T00:00:00Z`);
  const watch = new Set(snapshot.watchlist);
  const scoredBySlug = new Map<string, { p: SnapshotProtocol; value: number; breakdown: ValueBreakdown }>();

  const scored = snapshot.protocols.map((p) => {
    const { value, breakdown } = impliedValue(p, asOfMs);
    const entry = { p, value, breakdown };
    scoredBySlug.set(p.slug, entry);
    return entry;
  });
  const byValue = (a: (typeof scored)[number], b: (typeof scored)[number]): number =>
    b.value - a.value || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0);

  const chosen = new Map<string, (typeof scored)[number]>();
  for (const slug of snapshot.watchlist) {
    const entry = scoredBySlug.get(slug);
    if (entry !== undefined) chosen.set(slug, entry);
  }
  const candidates = scored.filter((s) => isCandidate(s.p) && !chosen.has(s.p.slug)).sort(byValue);
  for (const entry of candidates) {
    if (chosen.size >= BOARD_TARGET) break;
    chosen.set(entry.p.slug, entry);
  }
  if (chosen.size < BOARD_TARGET) {
    const flagged = scored
      .filter(
        (s) =>
          recordsNoToken(s.p) &&
          !EXCLUDED_CATEGORIES.has(s.p.category ?? '') &&
          nameFlag(s.p) !== null &&
          !chosen.has(s.p.slug),
      )
      .sort(byValue);
    for (const entry of flagged) {
      if (chosen.size >= BOARD_TARGET) break;
      chosen.set(entry.p.slug, entry);
    }
  }

  const rows: BoardRow[] = [...chosen.values()].sort(byValue).map((entry, i) => {
    const { p, value, breakdown } = entry;
    return {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      implied_value_usd: value,
      farm_steps: farmSteps(p),
      category: p.category,
      chains: [...p.chains].sort(),
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: breakdown.age_days,
      listed_at: p.listed_at,
      watchlist: watch.has(p.slug),
      name_flag: nameFlag(p),
      value: breakdown,
    };
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !recordsNoToken(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 30)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: [...p.chains].sort().slice(0, 6),
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
    }));

  const preToken = snapshot.protocols.filter(recordsNoToken).length;
  const setAside = snapshot.protocols.filter((p) => !recordsNoToken(p)).length;

  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    snapshot_size: snapshot.protocols.length,
    pre_token_size: preToken,
    watchlist_size: snapshot.watchlist.length,
    live_size: live.length,
    set_aside_size: setAside,
    model:
      'implied value = TVL x 0.30 x growth x age x breadth. growth = 1 + clamp(7-day TVL change, -50%, +200%) / 2. age = 1 + months listed (capped at 36) x 0.008. breadth = 1 + extra chains (capped at 8) x 0.01. A protocol records no token when its record carries neither a CoinGecko id nor a ticker.',
    rows,
    live,
  };
  return { board: rows, radar };
}

/** The dashboard's data file: one script that sets window.RADAR. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/**
 * The gate's own shape, checked before anything is written: row count, watchlist
 * coverage, ranks 1..N once each, values non-rising with rank and not all equal,
 * farm steps 3–12 of 20–600 characters. Returns the first problem, or null.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, not 100 to 4000`;
  const slugs = new Set<string>();
  for (const row of board) {
    if (slugs.has(row.slug)) return `slug ${row.slug} appears twice`;
    slugs.add(row.slug);
  }
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const row of board) if (!known.has(row.slug)) return `slug ${row.slug} is not in the snapshot`;
  for (const slug of snapshot.watchlist) if (!slugs.has(slug)) return `watchlist slug ${slug} is missing`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `ranks are not exactly 1..${board.length}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${i} to rank ${i + 1}`;
    }
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (values.size < 2) return 'every implied value is the same';
  for (const row of board) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `${row.slug}: ${row.farm_steps.length} farm steps, not 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `${row.slug}: a farm step is ${n} characters, not 20 to 600`;
    }
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 100_000_000_000_000) {
      return `${row.slug}: implied value ${row.implied_value_usd} is out of range`;
    }
  }
  return null;
}
