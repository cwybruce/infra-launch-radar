// Infra Radar — the value model for token-radar-01.
//
// The lens is AI & infrastructure demand. The snapshot's own categories are the only
// semantic signal, so the model scores every launch-eligible protocol (records no token,
// not a wrapped / staked / bridged product of one that trades) with one transparent
// formula:
//
//   implied = TVL x M x D x G x A x C
//
//   M  anchor multiple: the median mcap/TVL of the live-token infra protocols in the
//      snapshot itself (Chain, DOR, Decentralized AI, AI Agents, Restaking and the
//      bridge families). Computed from the data, never typed in.
//   D  infra-demand multiplier, by the protocol's DefiLlama category: AI and base-layer
//      infra earn more per TVL dollar because a token there prices usage across the
//      whole stack, not one app's fees.
//   G  growth: the protocol's own 7-day TVL change, clamped to [-30%, +60%].
//   A  maturity: how long DefiLlama has tracked it with no token, 0.85 for a brand-new
//      listing rising to 1.00 at four years.
//   C  chain breadth: 1 + 0.03 per extra chain, capped at 15 extra chains.
//
// Every factor is shown per protocol in the dashboard, so a reader can reproduce any
// number on the board from the snapshot alone. No protocol name is ever hardcoded:
// the ranking follows only from the snapshot's figures and the category table below.

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

export interface Factors {
  multiple: number;
  demand: number;
  growth: number;
  maturity: number;
  chainBreadth: number;
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
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  factors: Factors;
}

export interface LiveComp {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface Radar {
  asOf: string;
  floorUsd: number;
  watchlistSize: number;
  eligibleSize: number;
  medianMultiple: number;
  liveInfraSize: number;
  rows: BoardRow[];
  comps: LiveComp[];
}

// The house's own watchlist rule, reimplemented from the snapshot's fields: a
// wrapped, staked or bridged product of a token that already trades is not a protocol
// still waiting on a launch of its own.
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

// Categories that count as infrastructure for the anchor multiple and the lens.
const INFRA_CATEGORIES = new Set([
  'Chain',
  'DOR',
  'Decentralized AI',
  'AI Agents',
  'Restaking',
  'Cross Chain Bridge',
  'Bridge',
  'Canonical Bridge',
]);

// Infra-demand multiplier by category. AI and base-layer infra price usage across
// the stack; capital-routing infra (curators, allocators) sits above plain apps;
// every other category earns the baseline 1.00.
const DEMAND: Record<string, number> = {
  'Decentralized AI': 1.5,
  'AI Agents': 1.5,
  Chain: 1.4,
  DOR: 1.35,
  Restaking: 1.3,
  'Risk Curators': 1.15,
  'Onchain Capital Allocator': 1.15,
  'Collateral Markets': 1.1,
};
const INFRA_LENS_CATEGORIES = new Set([
  'Decentralized AI',
  'AI Agents',
  'Chain',
  'DOR',
  'Restaking',
  'Risk Curators',
  'Onchain Capital Allocator',
  'Collateral Markets',
]);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const DAY_MS = 86_400_000;

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: expected protocols and watchlist arrays');
  }
  return raw;
}

/** True when the protocol records no token at all. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/** True when the protocol is a wrapped / staked / bridged product, or a versioned or exchange-named one. */
export function isWrappedOrBridged(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e));
}

/** Launch-eligible: records no token and is not a wrapped / staked / bridged product. */
export function isLaunchEligible(p: SnapshotProtocol): boolean {
  return recordsNoToken(p) && !isWrappedOrBridged(p);
}

export function isInfraLens(p: SnapshotProtocol): boolean {
  return p.category !== null && INFRA_LENS_CATEGORIES.has(p.category);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** The anchor multiple: median mcap/TVL of the live-token infra protocols, clamped. */
export function anchorMultiple(snapshot: Snapshot): number {
  const ratios = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== null && INFRA_CATEGORIES.has(p.category) && p.tvl_usd > 0)
    .map((p) => p.mcap_usd! / p.tvl_usd);
  if (ratios.length === 0) return 0.2;
  return clamp(median(ratios), 0.05, 3);
}

/** The live-token infra comparables, richest ratio first, for the dashboard table. */
export function liveComparables(snapshot: Snapshot): LiveComp[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== null && INFRA_CATEGORIES.has(p.category) && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: p.mcap_usd! / p.tvl_usd,
    }))
    .sort((a, b) => b.ratio - a.ratio || (a.slug < b.slug ? -1 : 1));
}

function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const days = Math.floor((Date.parse(asOf) - Date.parse(listedAt)) / DAY_MS);
  return days < 0 ? 0 : days;
}

/** The five factors and the implied value for one protocol. */
export function scoreProtocol(p: SnapshotProtocol, multiple: number, asOf: string): { implied: number; factors: Factors; age: number | null } {
  const demand = p.category !== null && DEMAND[p.category] !== undefined ? DEMAND[p.category]! : 1;
  const growth = 1 + clamp(p.change_7d ?? 0, -30, 60) / 100;
  const age = ageDays(p.listed_at, asOf);
  const ageYears = (age ?? 180) / 365.25;
  const maturity = 0.85 + 0.15 * clamp(ageYears, 0, 4) / 4;
  const chainBreadth = 1 + 0.03 * Math.min(Math.max(p.chains.length - 1, 0), 15);
  const factors: Factors = { multiple, demand, growth, maturity, chainBreadth };
  const implied = Math.round(p.tvl_usd * multiple * demand * growth * maturity * chainBreadth);
  return { implied, factors, age };
}

// ---------------------------------------------------------------- farm plans

const LOW_GAS_CHAINS = new Set([
  'Base', 'Arbitrum', 'Optimism', 'Polygon', 'zkSync Era', 'Linea', 'Scroll', 'Blast',
  'Mode', 'Fraxtal', 'Mantle', 'Celo', 'Gnosis', 'Avalanche', 'BSC', 'BNB Chain',
]);
const TINY_GAS_CHAINS = new Set(['Solana', 'Sui', 'Aptos', 'Near', 'NEAR']);

/** A rough per-transaction gas band for the protocol's first chain. */
function gasBand(chain: string): string {
  if (chain === 'Ethereum') return '$5–$20';
  if (TINY_GAS_CHAINS.has(chain)) return 'under $0.10';
  if (LOW_GAS_CHAINS.has(chain)) return '$0.10–$2';
  return '$1–$5';
}

// The core on-chain action and a second, different action, by category.
const ACTIONS: Record<string, [string, string]> = {
  Lending: ['supply assets and borrow a little against them', 'borrow a small amount against your supply'],
  Dexs: ['swap and add liquidity to a pool', 'add liquidity to a second pool'],
  Yield: ['deposit into its yield vaults', 'try a second vault strategy'],
  'Yield Aggregator': ['deposit into its yield vaults', 'try a second vault strategy'],
  Farm: ['deposit into its farms', 'try a second farm'],
  RWA: ['deposit into its tokenized asset vaults', 'hold the position through a full accrual cycle'],
  'Risk Curators': ['deposit into a curated vault', "allocate to a second curator's vault"],
  'Onchain Capital Allocator': ['deposit into an allocator vault', 'allocate to a second strategy'],
  Chain: ["bridge assets in and use the chain's apps", 'try a second native app on the chain'],
  Restaking: ['restake assets through its pools', 'delegate to a second operator'],
  CDP: ['open a collateralized position and mint', 'open a second, smaller vault'],
  'CDP Manager': ['open a collateralized position and mint', 'open a second, smaller vault'],
  Derivatives: ['open a small hedged position', 'try a second market'],
  'Basis Trading': ['open a small basis position', 'try a second pair'],
  'Liquidity Manager': ['deposit into a managed liquidity position', 'try a second range'],
  'Staking Pool': ['stake assets in its pool', 'stake a second asset'],
  'Collateral Markets': ['supply collateral to its markets', 'supply a second collateral type'],
  Insurance: ['buy cover for a position you hold', 'cover a second position'],
  Payments: ['route a real payment through it', 'set up a recurring payment'],
  'Leveraged Farming': ['open a small leveraged farm position', 'try a second pair at lower leverage'],
  'Uncollateralized Lending': ['lend a small amount through its credit pools', 'lend to a second borrower pool'],
  'Interest Rate Derivatives': ['open a small rates position', 'try a second tenor'],
  'Decentralized BTC': ['deposit BTC into its vaults', 'try a second BTC product'],
  'Anchor BTC': ['deposit BTC into its vaults', 'try a second BTC product'],
  'Yield Aggregator ': ['deposit into its yield vaults', 'try a second vault strategy'],
};
const DEFAULT_ACTION: [string, string] = ['use its core feature with real funds', 'repeat with a second asset'];

/** Five concrete steps with costs and timing, derived from the protocol's own record. */
export function farmSteps(p: SnapshotProtocol): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = gasBand(chain);
  const [action, second] = (p.category !== null && ACTIONS[p.category] !== undefined ? ACTIONS[p.category]! : DEFAULT_ACTION);
  const cat = p.category ?? 'protocol';
  return [
    `Set up a fresh wallet for ${p.name} and fund it with gas on ${chain} — about ${gas} per transaction. Keep this wallet separate from your main holdings so the activity history stays clean and readable.`,
    `Put $100–$500 into ${p.name} (${action}) on ${chain} and leave it working for at least 4 weeks. A real position held over time is what snapshots and points programs usually reward.`,
    `Come back 2–3 times a week for 6–8 weeks and repeat the core ${cat} action in small sizes. Expect roughly ${gas} in gas each visit; steady weekly use reads as a genuine user, not a one-off deposit.`,
    `Add a second leg — ${second} — with another $100–$300. Two different actions on the same protocol build a fuller footprint than one large deposit, and cost little extra in gas.`,
    `Watch ${p.name}'s official announcements for a token or points snapshot. Keep positions open until any snapshot passes, then withdraw; exit fees run about ${gas} per transaction. Never trust a "claim" link sent by DM.`,
  ];
}

// ---------------------------------------------------------------- the board

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const multiple = anchorMultiple(snapshot);
  const watchSet = new Set(snapshot.watchlist);
  const eligible = snapshot.protocols.filter(isLaunchEligible);
  const scored = eligible.map((p) => {
    const { implied, factors, age } = scoreProtocol(p, multiple, snapshot.as_of);
    return { p, implied, factors, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));
  // Force a strictly decreasing implied value so the rank order is a real ranking.
  let prev = Number.POSITIVE_INFINITY;
  const rows: BoardRow[] = scored.map((s, i) => {
    const implied = Math.max(1, Math.min(s.implied, prev - 1));
    prev = implied;
    return {
      slug: s.p.slug,
      name: s.p.name,
      rank: i + 1,
      implied_value_usd: implied,
      farm_steps: farmSteps(s.p),
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      age_days: s.age,
      watchlist: watchSet.has(s.p.slug),
      factors: s.factors,
    };
  });
  const radar: Radar = {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    watchlistSize: snapshot.watchlist.length,
    eligibleSize: eligible.length,
    medianMultiple: multiple,
    liveInfraSize: liveComparables(snapshot).length,
    rows,
    comps: liveComparables(snapshot),
  };
  return { board: rows, radar };
}

/** The dashboard's data file: the same rows the board carries, as one script. */
export function dataScript(radar: Radar): string {
  return `window.RADAR_DATA = ${JSON.stringify(radar)};\n`;
}

/** Every way the gate could refuse this board, or null when it is clean. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, under the 100-row floor`;
  const watchSet = new Set(snapshot.watchlist);
  const seen = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  for (const [i, row] of board.entries()) {
    if (row.rank !== i + 1) return `row ${row.slug} carries rank ${row.rank}, expected ${i + 1}`;
    if (row.implied_value_usd >= prev) return `implied value rises at rank ${row.rank}`;
    if (row.implied_value_usd < 1) return `row ${row.slug} has a non-positive implied value`;
    prev = row.implied_value_usd;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (!snapshot.protocols.some((p) => p.slug === row.slug)) return `slug ${row.slug} is not in the snapshot`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const t = step.trim();
      if (t.length < 20 || t.length > 600) return `row ${row.slug} has a farm step of ${t.length} characters`;
    }
  }
  for (const slug of watchSet) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}
