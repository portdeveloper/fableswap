"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { FaucetCard } from "@/components/FaucetCard";
import { PoolCard } from "@/components/PoolCard";
import { SwapCard } from "@/components/SwapCard";
import { deployments } from "@/lib/deployments";
import { config, type SupportedChainId } from "@/lib/wagmi";

const supportedIds = config.chains.map((c) => c.id) as number[];

export default function Home() {
  const { chainId: walletChainId, isConnected } = useAccount();
  const defaultChainId = useChainId();
  const rawChainId = (isConnected ? walletChainId : undefined) ?? defaultChainId;
  const chainId = (
    supportedIds.includes(rawChainId) ? rawChainId : defaultChainId
  ) as SupportedChainId;
  const deployment = deployments[chainId];
  const [tab, setTab] = useState<"swap" | "pool">("swap");

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="text-violet-400">Fable</span>Swap
        </h1>
        <ConnectButton />
      </header>

      {!deployment ? (
        <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-400 ring-1 ring-zinc-800">
          No FableSwap deployment on chain {chainId}. Switch your wallet to Monad
          testnet (10143) or a local Anvil node (31337).
        </div>
      ) : (
        <>
          <nav className="flex gap-1 rounded-xl bg-zinc-900 p-1 ring-1 ring-zinc-800">
            {(["swap", "pool"] as const).map((t) => (
              <button
                key={t}
                data-testid={`tab-${t}`}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-sm font-medium capitalize ${
                  tab === t ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          {tab === "swap" ? (
            <SwapCard deployment={deployment} chainId={chainId} />
          ) : (
            <PoolCard deployment={deployment} chainId={chainId} />
          )}

          <FaucetCard deployment={deployment} chainId={chainId} />
        </>
      )}

      <footer className="mt-auto pt-4 text-center text-xs text-zinc-600">
        Constant-product AMM · 0.3% fee · demo tokens only
      </footer>
    </div>
  );
}
