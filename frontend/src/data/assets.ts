import type { Asset, SymbolCode } from "../types/market.js";

export const assets: Asset[] = [
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF", price: 589.42, changePercent: 0.64, bars: [8, 12, 9, 15, 17, 14, 21], available: true },
  { symbol: "QLD", name: "ProShares Ultra QQQ", type: "LEVERAGED_ETF", price: 138.17, changePercent: 1.21, bars: [7, 13, 9, 18, 12, 20, 23], available: true },
  { symbol: "TSLA", name: "Tesla", type: "STOCK", price: 311.08, changePercent: -0.73, bars: [17, 13, 20, 12, 9, 14, 11], available: true },
  { symbol: "SPCX", name: "Identity not verified", type: "UNVERIFIED", price: null, changePercent: null, bars: [], available: false },
  { symbol: "GOOG", name: "Alphabet Inc. Class C", type: "STOCK", price: 212.46, changePercent: 0.31, bars: [9, 11, 10, 14, 13, 16, 18], available: true },
];

export function getAsset(symbol: SymbolCode): Asset {
  const asset = assets.find((candidate) => candidate.symbol === symbol);
  if (!asset) throw new Error("Unsupported fixture asset.");
  return asset;
}
