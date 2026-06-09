"use client";

import { useAccount, useReadContract } from "wagmi";
import { erc20Abi } from "@/lib/abi";
import type { Deployment, TokenInfo } from "@/lib/deployments";
import type { SupportedChainId } from "@/lib/wagmi";
import { fmt } from "@/lib/format";
import { TxStatus, useTrackedWrite } from "@/components/tx";

function TokenRow({ token, chainId }: { token: TokenInfo; chainId: SupportedChainId }) {
  const { address, isConnected } = useAccount();
  const tx = useTrackedWrite();

  const { data: balance } = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: !!address },
  });

  return (
    <div className="flex items-center justify-between rounded-xl bg-zinc-950 p-3 ring-1 ring-zinc-800">
      <div>
        <div className="text-sm font-medium">{token.symbol}</div>
        <div className="text-xs text-zinc-500">
          Balance:{" "}
          <span data-testid={`balance-${token.symbol}`}>{fmt(balance, token.decimals)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <button
          data-testid={`faucet-${token.symbol}`}
          disabled={!isConnected || tx.isPending || tx.isConfirming}
          onClick={() =>
            tx.write({
              address: token.address,
              abi: erc20Abi,
              functionName: "faucet",
              chainId,
            })
          }
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 disabled:opacity-40"
        >
          Get 1,000 {token.symbol}
        </button>
        <TxStatus tx={tx} />
      </div>
    </div>
  );
}

export function FaucetCard({ deployment, chainId }: { deployment: Deployment; chainId: SupportedChainId }) {
  return (
    <div className="space-y-2 rounded-2xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
      <h2 className="text-sm font-medium text-zinc-400">Test tokens</h2>
      {deployment.tokens.map((t) => (
        <TokenRow key={t.address} token={t} chainId={chainId} />
      ))}
    </div>
  );
}
