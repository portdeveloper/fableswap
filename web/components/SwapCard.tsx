"use client";

import { useMemo, useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, routerAbi } from "@/lib/abi";
import type { Deployment } from "@/lib/deployments";
import type { SupportedChainId } from "@/lib/wagmi";
import { applySlippage, deadline, fmt, getAmountOut } from "@/lib/format";
import { TxStatus, useTrackedWrite } from "@/components/tx";

export function SwapCard({ deployment, chainId }: { deployment: Deployment; chainId: SupportedChainId }) {
  const { address, isConnected } = useAccount();
  const [flipped, setFlipped] = useState(false);
  const [amountInStr, setAmountInStr] = useState("");
  const [slippageBps, setSlippageBps] = useState(50); // 0.5%

  const [tokenIn, tokenOut] = flipped
    ? [deployment.tokens[1], deployment.tokens[0]]
    : [deployment.tokens[0], deployment.tokens[1]];

  const amountIn = useMemo(() => {
    try {
      return parseUnits(amountInStr || "0", tokenIn.decimals);
    } catch {
      return 0n;
    }
  }, [amountInStr, tokenIn.decimals]);

  const { data: reserves } = useReadContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "getReserves",
    args: [tokenIn.address, tokenOut.address],
    chainId,
  });
  const [reserveIn, reserveOut] = reserves ?? [0n, 0n];

  const { data: balanceIn } = useReadContract({
    address: tokenIn.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenIn.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, deployment.router] : undefined,
    chainId,
    query: { enabled: !!address },
  });

  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
  const minOut = applySlippage(amountOut, slippageBps);

  const priceImpactBps = useMemo(() => {
    if (amountIn === 0n || amountOut === 0n || reserveIn === 0n || reserveOut === 0n) return 0;
    // impact = 1 - (out/in) / (rOut/rIn), in basis points
    const exec = (amountOut * 1_000_000n) / amountIn;
    const spot = (reserveOut * 1_000_000n) / reserveIn;
    if (spot === 0n) return 0;
    return Number(((spot - exec) * 10_000n) / spot);
  }, [amountIn, amountOut, reserveIn, reserveOut]);

  const needsApproval = allowance !== undefined && amountIn > 0n && allowance < amountIn;
  const insufficient = balanceIn !== undefined && amountIn > balanceIn;

  const approveTx = useTrackedWrite();
  const swapTx = useTrackedWrite();

  async function onApprove() {
    await approveTx.write({
      address: tokenIn.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [deployment.router, amountIn],
      chainId,
    });
    refetchAllowance();
  }

  async function onSwap() {
    swapTx.reset();
    await swapTx.write({
      address: deployment.router,
      abi: routerAbi,
      functionName: "swapExactTokensForTokens",
      args: [amountIn, minOut, tokenIn.address, tokenOut.address, address!, deadline()],
      chainId,
    });
    setAmountInStr("");
  }

  const disabled =
    !isConnected || amountIn === 0n || insufficient || reserveIn === 0n || reserveOut === 0n;

  return (
    <div className="space-y-3 rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-400">Swap</h2>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          Slippage
          <select
            value={slippageBps}
            onChange={(e) => setSlippageBps(Number(e.target.value))}
            className="rounded bg-zinc-800 px-1 py-0.5 text-xs"
          >
            <option value={10}>0.1%</option>
            <option value={50}>0.5%</option>
            <option value={100}>1%</option>
            <option value={300}>3%</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>You pay</span>
          <button
            className="hover:text-zinc-300"
            onClick={() =>
              balanceIn !== undefined && setAmountInStr(fmt(balanceIn, tokenIn.decimals, 18))
            }
          >
            Balance: {fmt(balanceIn, tokenIn.decimals)} (max)
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            data-testid="swap-amount-in"
            value={amountInStr}
            onChange={(e) => setAmountInStr(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.0"
            inputMode="decimal"
            className="w-full bg-transparent text-2xl outline-none placeholder:text-zinc-700"
          />
          <span className="rounded-lg bg-zinc-800 px-3 py-1 text-sm font-medium">
            {tokenIn.symbol}
          </span>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          data-testid="swap-flip"
          onClick={() => {
            setFlipped((f) => !f);
            setAmountInStr("");
          }}
          className="rounded-full bg-zinc-800 p-2 text-zinc-400 hover:text-zinc-100"
          aria-label="Flip direction"
        >
          ↓↑
        </button>
      </div>

      <div className="rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
        <div className="text-xs text-zinc-500">You receive (estimated)</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="w-full text-2xl text-zinc-300" data-testid="swap-amount-out">
            {amountIn > 0n ? fmt(amountOut, tokenOut.decimals, 6) : "0.0"}
          </span>
          <span className="rounded-lg bg-zinc-800 px-3 py-1 text-sm font-medium">
            {tokenOut.symbol}
          </span>
        </div>
      </div>

      {amountIn > 0n && amountOut > 0n && (
        <div className="space-y-1 px-1 text-xs text-zinc-500">
          <div className="flex justify-between">
            <span>Minimum received</span>
            <span>
              {fmt(minOut, tokenOut.decimals, 6)} {tokenOut.symbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Price impact</span>
            <span className={priceImpactBps > 300 ? "text-red-400" : ""}>
              {(priceImpactBps / 100).toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {needsApproval ? (
        <button
          data-testid="swap-approve"
          onClick={onApprove}
          disabled={disabled || approveTx.isPending || approveTx.isConfirming}
          className="w-full rounded-xl bg-violet-600 py-3 font-medium hover:bg-violet-500 disabled:opacity-40"
        >
          Approve {tokenIn.symbol}
        </button>
      ) : (
        <button
          data-testid="swap-submit"
          onClick={onSwap}
          disabled={disabled || swapTx.isPending || swapTx.isConfirming}
          className="w-full rounded-xl bg-violet-600 py-3 font-medium hover:bg-violet-500 disabled:opacity-40"
        >
          {!isConnected
            ? "Connect wallet"
            : insufficient
              ? `Insufficient ${tokenIn.symbol}`
              : amountIn === 0n
                ? "Enter amount"
                : "Swap"}
        </button>
      )}

      <TxStatus tx={approveTx} />
      <TxStatus tx={swapTx} />
    </div>
  );
}
