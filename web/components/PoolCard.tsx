"use client";

import { useMemo, useState } from "react";
import { parseUnits, zeroAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, factoryAbi, pairAbi, routerAbi } from "@/lib/abi";
import type { Deployment } from "@/lib/deployments";
import type { SupportedChainId } from "@/lib/wagmi";
import { applySlippage, deadline, fmt } from "@/lib/format";
import { TxStatus, useTrackedWrite } from "@/components/tx";

export function PoolCard({ deployment, chainId }: { deployment: Deployment; chainId: SupportedChainId }) {
  const { address, isConnected } = useAccount();
  const [tokenA, tokenB] = deployment.tokens;
  const [amountAStr, setAmountAStr] = useState("");
  const [amountBStr, setAmountBStr] = useState("");
  const [removeStr, setRemoveStr] = useState("");

  const { data: reserves } = useReadContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "getReserves",
    args: [tokenA.address, tokenB.address],
    chainId,
    query: { retry: false },
  });
  const [reserveA, reserveB] = reserves ?? [0n, 0n];
  const hasPool = reserveA > 0n && reserveB > 0n;

  const { data: pairAddress } = useReadContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "getPair",
    args: [tokenA.address, tokenB.address],
    chainId,
  });
  const pairKnown = pairAddress && pairAddress !== zeroAddress;

  const { data: lpBalance } = useReadContract({
    address: pairKnown ? pairAddress : undefined,
    abi: pairAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: !!address && !!pairKnown },
  });
  const { data: lpSupply } = useReadContract({
    address: pairKnown ? pairAddress : undefined,
    abi: pairAbi,
    functionName: "totalSupply",
    chainId,
    query: { enabled: !!pairKnown },
  });
  const { data: lpAllowance, refetch: refetchLpAllowance } = useReadContract({
    address: pairKnown ? pairAddress : undefined,
    abi: pairAbi,
    functionName: "allowance",
    args: address ? [address, deployment.router] : undefined,
    chainId,
    query: { enabled: !!address && !!pairKnown },
  });

  const amountA = useMemo(() => {
    try {
      return parseUnits(amountAStr || "0", tokenA.decimals);
    } catch {
      return 0n;
    }
  }, [amountAStr, tokenA.decimals]);

  // With an existing pool the B side is fixed by the reserve ratio.
  const amountB = useMemo(() => {
    if (hasPool) return amountA > 0n ? (amountA * reserveB) / reserveA : 0n;
    try {
      return parseUnits(amountBStr || "0", tokenB.decimals);
    } catch {
      return 0n;
    }
  }, [hasPool, amountA, reserveA, reserveB, amountBStr, tokenB.decimals]);

  const removeLp = useMemo(() => {
    try {
      return parseUnits(removeStr || "0", 18);
    } catch {
      return 0n;
    }
  }, [removeStr]);

  const allowanceA = useReadContract({
    address: tokenA.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, deployment.router] : undefined,
    chainId,
    query: { enabled: !!address },
  });
  const allowanceB = useReadContract({
    address: tokenB.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, deployment.router] : undefined,
    chainId,
    query: { enabled: !!address },
  });

  const needsApproveA = allowanceA.data !== undefined && amountA > 0n && allowanceA.data < amountA;
  const needsApproveB = allowanceB.data !== undefined && amountB > 0n && allowanceB.data < amountB;
  const needsApproveLp = lpAllowance !== undefined && removeLp > 0n && lpAllowance < removeLp;

  const approveTx = useTrackedWrite();
  const addTx = useTrackedWrite();
  const removeTx = useTrackedWrite();

  async function approve(token: `0x${string}`, amount: bigint) {
    await approveTx.write({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [deployment.router, amount],
      chainId,
    });
    allowanceA.refetch();
    allowanceB.refetch();
    refetchLpAllowance();
  }

  async function onAdd() {
    await addTx.write({
      address: deployment.router,
      abi: routerAbi,
      functionName: "addLiquidity",
      args: [
        tokenA.address,
        tokenB.address,
        amountA,
        amountB,
        hasPool ? applySlippage(amountA, 50) : 0n,
        hasPool ? applySlippage(amountB, 50) : 0n,
        address!,
        deadline(),
      ],
      chainId,
    });
    setAmountAStr("");
    setAmountBStr("");
  }

  async function onRemove() {
    await removeTx.write({
      address: deployment.router,
      abi: routerAbi,
      functionName: "removeLiquidity",
      args: [tokenA.address, tokenB.address, removeLp, 0n, 0n, address!, deadline()],
      chainId,
    });
    setRemoveStr("");
  }

  const shareBps =
    lpBalance !== undefined && lpSupply !== undefined && lpSupply > 0n
      ? Number((lpBalance * 10_000n) / lpSupply)
      : 0;

  return (
    <div className="space-y-4 rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
      <h2 className="text-sm font-medium text-zinc-400">Pool</h2>

      <div className="rounded-xl bg-zinc-950 p-3 text-sm ring-1 ring-zinc-800">
        <div className="flex justify-between text-zinc-400">
          <span>Reserves</span>
          <span data-testid="pool-reserves">
            {fmt(reserveA)} {tokenA.symbol} / {fmt(reserveB)} {tokenB.symbol}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-zinc-400">
          <span>Your LP balance</span>
          <span data-testid="pool-lp-balance">
            {fmt(lpBalance)} FLP {shareBps > 0 ? `(${(shareBps / 100).toFixed(2)}%)` : ""}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">Add liquidity</h3>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
            <div className="text-xs text-zinc-500">{tokenA.symbol}</div>
            <input
              data-testid="add-amount-a"
              value={amountAStr}
              onChange={(e) => setAmountAStr(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full bg-transparent text-lg outline-none placeholder:text-zinc-700"
            />
          </div>
          <div className="flex-1 rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
            <div className="text-xs text-zinc-500">
              {tokenB.symbol} {hasPool && "(auto)"}
            </div>
            {hasPool ? (
              <div className="text-lg text-zinc-300" data-testid="add-amount-b">
                {amountA > 0n ? fmt(amountB, tokenB.decimals, 6) : "0.0"}
              </div>
            ) : (
              <input
                data-testid="add-amount-b"
                value={amountBStr}
                onChange={(e) => setAmountBStr(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.0"
                inputMode="decimal"
                className="w-full bg-transparent text-lg outline-none placeholder:text-zinc-700"
              />
            )}
          </div>
        </div>
        {needsApproveA ? (
          <button
            data-testid="add-approve-a"
            onClick={() => approve(tokenA.address, amountA)}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium hover:bg-violet-500"
          >
            Approve {tokenA.symbol}
          </button>
        ) : needsApproveB ? (
          <button
            data-testid="add-approve-b"
            onClick={() => approve(tokenB.address, amountB)}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium hover:bg-violet-500"
          >
            Approve {tokenB.symbol}
          </button>
        ) : (
          <button
            data-testid="add-submit"
            onClick={onAdd}
            disabled={!isConnected || amountA === 0n || amountB === 0n || addTx.isConfirming}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium hover:bg-violet-500 disabled:opacity-40"
          >
            Add liquidity
          </button>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">Remove liquidity</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>FLP amount</span>
              <button
                className="hover:text-zinc-300"
                onClick={() => lpBalance !== undefined && setRemoveStr(fmt(lpBalance, 18, 18))}
              >
                max
              </button>
            </div>
            <input
              data-testid="remove-amount"
              value={removeStr}
              onChange={(e) => setRemoveStr(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full bg-transparent text-lg outline-none placeholder:text-zinc-700"
            />
          </div>
          {needsApproveLp ? (
            <button
              data-testid="remove-approve"
              onClick={() => pairKnown && approve(pairAddress, removeLp)}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium hover:bg-violet-500"
            >
              Approve FLP
            </button>
          ) : (
            <button
              data-testid="remove-submit"
              onClick={onRemove}
              disabled={
                !isConnected ||
                removeLp === 0n ||
                (lpBalance !== undefined && removeLp > lpBalance) ||
                removeTx.isConfirming
              }
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium hover:bg-violet-500 disabled:opacity-40"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <TxStatus tx={approveTx} />
      <TxStatus tx={addTx} />
      <TxStatus tx={removeTx} />
    </div>
  );
}
