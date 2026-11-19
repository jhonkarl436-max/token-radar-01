export const MODEL_VERSION = 'radar-2';
export const MODEL = {
  growth_weight: 0.5,
  floor_usd: 50_000_000,
};

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number | null;
  change_7d: number | null;
  mcap_usd: number | null;
  gecko_id: string | null;
  symbol: string | null;
  listed_at: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age: number | null;
  implied_value_usd: number;
  growth_pct: number;
  growth_mult: number;
  maturity_mult: number;
  multiple: number;
  in_watchlist: boolean;
  farm_steps: string[];
}

export interface FarmStepObj {
  text: string;
  cost: number;
  time: number;
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age: number | null;
  implied_value_usd: number;
  growth_mult: number;
  maturity_mult: number;
  multiple: number;
  in_watchlist: boolean;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string;
  mcap_usd: number;
  tvl_usd: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: typeof MODEL;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (!listedAt) return null;
  const d = new Date(listedAt);
  if (isNaN(d.getTime())) return null;
  const diff = new Date(asOf).getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : null;
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const UNRANKABLE_CATS = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

const VERSION_REGEX = /(v\d+|\b\d+\.\d+\b)$/i;
const WRAPPED_REGEX = /(wrapped|staked|staking)/i;

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  const cat = p.category || '';
  if (UNRANKABLE_CATS.has(cat)) return false;
  const name = p.name || '';
  if (VERSION_REGEX.test(name)) return false;
  if (WRAPPED_REGEX.test(name)) return false;
  return true;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function categoryMultiples(snapshot: Snapshot): Record<string, number> {
  const catRatios: Record<string, number[]> = {};
  const allRatios: number[] = [];

  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd !== null && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      allRatios.push(ratio);
      const cat = p.category || 'Unknown';
      if (!catRatios[cat]) catRatios[cat] = [];
      catRatios[cat].push(ratio);
    }
  }

  const globalMedian = allRatios.length > 0 ? median(allRatios) : 0.2;
  const multiples: Record<string, number> = {};

  for (const cat of Object.keys(catRatios)) {
    const ratios = catRatios[cat];
    let m = ratios.length >= 3 ? median(ratios) : globalMedian;
    if (isNaN(m) || m <= 0) m = globalMedian;
    if (m < 0.05) m = 0.05;
    if (m > 3.0) m = 3.0;
    multiples[cat] = m;
  }
  multiples['__global__'] = Math.min(3.0, Math.max(0.05, globalMedian));
  return multiples;
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: typeof MODEL,
  multiples: Record<string, number>
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  multiple: number;
} {
  const tvl = protocol.tvl_usd ?? 0;
  const cat = protocol.category || 'Unknown';
  const multiple = multiples[cat] !== undefined ? multiples[cat] : (multiples['__global__'] ?? 0.2);

  const base = tvl * multiple;

  const rawChange = protocol.change_7d ?? 0;
  const growthPct = Math.max(-60, Math.min(120, rawChange));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;

  const age = ageDays(protocol.listed_at, asOf);
  const ageForModel = age ?? 365;
  const maturityMult = 0.6 + Math.min(ageForModel, 1095) / 1095 * 0.4;

  let implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return {
    implied,
    growthPct,
    growthMult,
    maturityMult,
    age,
    multiple,
  };
}

export function farmSteps(protocol: SnapshotProtocol, age: number | null): FarmStepObj[] {
  const cat = (protocol.category || '').toLowerCase();
  let coreAction = 'Deposit funds into protocol vault';

  if (cat.includes('lending') || cat.includes('cdp') || cat.includes('uncollateralized')) {
    coreAction = 'Supply assets as collateral and borrow securely';
  } else if (cat.includes('dex') || cat.includes('yield') || cat.includes('liquidity')) {
    coreAction = 'Provide liquidity in primary trading pools';
  } else if (cat.includes('bridge')) {
    coreAction = 'Bridge assets across connected networks';
  } else if (cat.includes('staking') || cat.includes('restaking') || cat.includes('btc')) {
    coreAction = 'Stake native tokens to secure validator network';
  } else if (cat.includes('perpetual') || cat.includes('deriv')) {
    coreAction = 'Deposit margin collateral for open positions';
  } else if (cat.includes('prediction')) {
    coreAction = 'Place predictive positions on active market outcomes';
  } else if (cat.includes('allocator') || cat.includes('curator')) {
    coreAction = 'Deposit capital into managed strategy vault';
  } else if (cat.includes('stable') || cat.includes('wrapper')) {
    coreAction = 'Mint or deposit stable reserve assets';
  } else if (cat.includes('rwa')) {
    coreAction = 'Mint yield-bearing real world asset tokens';
  } else if (cat.includes('insurance')) {
    coreAction = 'Purchase loss protection cover for deposits';
  }

  const tvl = protocol.tvl_usd ?? 0;
  let capital = 50;
  if (tvl > 5_000_000_000) capital = 250;
  else if (tvl > 1_000_000_000) capital = 150;
  else if (tvl > 100_000_000) capital = 100;

  const actualAge = age ?? 30;
  let holdDays = 30;
  if (actualAge < 180) holdDays = 60;
  else if (actualAge < 365) holdDays = 45;

  const chain = (protocol.chains && protocol.chains.length > 0) ? protocol.chains[0] : 'primary network';
  const protoName = protocol.name || 'protocol';

  const steps: FarmStepObj[] = [
    {
      text: `Prepare a dedicated fresh wallet containing only farming funds and seed offline for ${protoName}.`,
      cost: 3,
      time: 5,
    },
    {
      text: `Execute primary action on ${chain}: ${coreAction} with $${capital} initial capital.`,
      cost: capital,
      time: 15,
    },
    {
      text: `Perform one qualifying weekly interaction (swap, deposit, or vote) to maintain active user status.`,
      cost: 2,
      time: 10,
    },
    {
      text: `Maintain the position uninterrupted for ${holdDays} days to ensure activity spans multiple snapshots.`,
      cost: 0,
      time: holdDays,
    },
    {
      text: `Verify rewards and points exclusively through official ${protoName} app links; never sign unverified claims.`,
      cost: 0,
      time: 10,
    },
    {
      text: `Log wallet address, transaction hashes, dates, and balances in a secure local farm journal.`,
      cost: 0,
      time: 5,
    },
  ];

  return steps;
}

export function stepText(step: FarmStepObj): string {
  let text = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (text.length < 20) {
    text = text.padEnd(20, '.');
  } else if (text.length > 600) {
    text = text.slice(0, 596) + '...';
  }
  return text;
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const multiples = categoryMultiples(snapshot);
  const protoMap = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) {
    protoMap.set(p.slug, p);
  }

  const includedSlugs = new Set<string>();
  const rawRows: Omit<BoardRow, 'rank'>[] = [];

  // 1. Add all watchlist items (guaranteed)
  for (const wSlug of snapshot.watchlist) {
    const p = protoMap.get(wSlug);
    if (p) {
      includedSlugs.add(wSlug);
      const iv = impliedValue(p, snapshot.as_of, MODEL, multiples);
      const stepObjs = farmSteps(p, iv.age);
      const steps = stepObjs.map(stepText);
      rawRows.push({
        slug: p.slug,
        name: p.name,
        category: p.category || 'Unknown',
        chains: p.chains || [],
        tvl_usd: p.tvl_usd ?? 0,
        change_7d: p.change_7d,
        age: iv.age,
        implied_value_usd: iv.implied,
        growth_pct: iv.growthPct,
        growth_mult: iv.growthMult,
        maturity_mult: iv.maturityMult,
        multiple: iv.multiple,
        in_watchlist: true,
        farm_steps: steps,
      });
    }
  }

  // 2. Add all rankable pre-token protocols outside watchlist
  for (const p of snapshot.protocols) {
    if (!includedSlugs.has(p.slug) && isRankable(p)) {
      includedSlugs.add(p.slug);
      const iv = impliedValue(p, snapshot.as_of, MODEL, multiples);
      const stepObjs = farmSteps(p, iv.age);
      const steps = stepObjs.map(stepText);
      rawRows.push({
        slug: p.slug,
        name: p.name,
        category: p.category || 'Unknown',
        chains: p.chains || [],
        tvl_usd: p.tvl_usd ?? 0,
        change_7d: p.change_7d,
        age: iv.age,
        implied_value_usd: iv.implied,
        growth_pct: iv.growthPct,
        growth_mult: iv.growthMult,
        maturity_mult: iv.maturityMult,
        multiple: iv.multiple,
        in_watchlist: false,
        farm_steps: steps,
      });
    }
  }

  // Sort descending implied_value_usd, ascending slug tie-break
  rawRows.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) {
      return b.implied_value_usd - a.implied_value_usd;
    }
    return a.slug.localeCompare(b.slug);
  });

  // Ensure strict monotonic decreasing implied values with no duplicates
  const seenImplied = new Set<number>();
  const finalRows: BoardRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    let row = rawRows[i];
    let val = row.implied_value_usd;
    while (seenImplied.has(val)) {
      val += 1;
    }
    seenImplied.add(val);
    if (val !== row.implied_value_usd) {
      row = { ...row, implied_value_usd: val };
    }
    finalRows.push({
      ...row,
      rank: i + 1,
    });
  }

  // Re-sort to maintain strict descending order after slight adjustments
  finalRows.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) {
      return b.implied_value_usd - a.implied_value_usd;
    }
    return a.slug.localeCompare(b.slug);
  });

  // Re-assign exact 1..N ranks
  for (let i = 0; i < finalRows.length; i++) {
    finalRows[i].rank = i + 1;
  }

  return finalRows;
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  for (const w of snapshot.watchlist) {
    if (!board.some((r) => r.slug === w)) {
      return `Watchlist protocol missing from board: ${w}`;
    }
  }

  for (let i = 0; i < board.length; i++) {
    if (board[i].rank !== i + 1) {
      return `Invalid rank at index ${i}: expected ${i + 1}, got ${board[i].rank}`;
    }
    if (!Number.isInteger(board[i].implied_value_usd) || board[i].implied_value_usd < 1) {
      return `Invalid implied value for ${board[i].slug}: ${board[i].implied_value_usd}`;
    }
    if (i > 0 && board[i].implied_value_usd >= board[i - 1].implied_value_usd) {
      return `Implied value not strictly decreasing at index ${i} (${board[i].slug})`;
    }
    if (!Array.isArray(board[i].farm_steps) || board[i].farm_steps.length < 3 || board[i].farm_steps.length > 12) {
      return `Invalid farm steps count for ${board[i].slug}`;
    }
    for (const step of board[i].farm_steps) {
      if (typeof step !== 'string' || step.length < 20 || step.length > 600) {
        return `Farm step invalid or length out of bounds for ${board[i].slug}: ${typeof step === 'string' ? step.length : typeof step}`;
      }
    }
  }

  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const watchlistSize = snapshot.watchlist.length;
  const boardSize = board.length;
  const earlySize = board.filter((r) => !r.in_watchlist).length;

  const tokenedNoCex = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.category !== 'CEX'
  );
  tokenedNoCex.sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
  const top24 = tokenedNoCex.slice(0, 24);

  const live: LiveRow[] = top24.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category || 'Unknown',
    mcap_usd: p.mcap_usd ?? 0,
    tvl_usd: p.tvl_usd ?? 0,
  }));

  const rows: RadarRow[] = board.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    age: r.age,
    implied_value_usd: r.implied_value_usd,
    growth_mult: r.growth_mult,
    maturity_mult: r.maturity_mult,
    multiple: r.multiple,
    in_watchlist: r.in_watchlist,
    farm_steps: r.farm_steps,
  }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: watchlistSize,
    board_size: boardSize,
    early_size: earlySize,
    live_size: live.length,
    rows,
    live,
  };

  return { board, radar };
}

export function parseSnapshot(raw: any): Snapshot {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid snapshot root');
  }
  const as_of = typeof raw.as_of === 'string' ? raw.as_of : '2026-11-14';
  const source = typeof raw.source === 'string' ? raw.source : 'DefiLlama';
  const floor_usd = typeof raw.floor_usd === 'number' ? raw.floor_usd : 50_000_000;
  const watchlist = Array.isArray(raw.watchlist)
    ? raw.watchlist.map((w: any) => String(w))
    : [];

  const rawProtos = Array.isArray(raw.protocols) ? raw.protocols : [];
  const protocols: SnapshotProtocol[] = rawProtos.map((p: any) => ({
    slug: String(p.slug || ''),
    name: String(p.name || ''),
    category: typeof p.category === 'string' ? p.category : null,
    chains: Array.isArray(p.chains) ? p.chains.map((c: any) => String(c)) : [],
    tvl_usd: typeof p.tvl_usd === 'number' ? p.tvl_usd : null,
    change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
    mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
    gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
    symbol: typeof p.symbol === 'string' ? p.symbol : null,
    listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
  }));

  return {
    as_of,
    source,
    floor_usd,
    protocols,
    watchlist,
  };
}
