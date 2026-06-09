import { formatUnits } from "viem";

/// Human-friendly token amount: trims to a sensible precision.
export function fmt(value: bigint | undefined, decimals = 18, precision = 4): string {
  if (value === undefined) return "—";
  const s = formatUnits(value, decimals);
  const [int, frac] = s.split(".");
  if (!frac || precision === 0) return int;
  return `${int}.${frac.slice(0, precision)}`.replace(/\.?0+$/, "") || "0";
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/// Constant-product quote with 0.3% fee — mirrors Router.getAmountOut.
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const amountInWithFee = amountIn * 997n;
  return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
}

export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function deadline(secondsFromNow = 600): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + secondsFromNow);
}
