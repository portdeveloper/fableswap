"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useChains } from "wagmi";
import { shortAddr } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const chains = useChains();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
          {chain?.name ?? `chain ${chainId}`}
        </span>
        <span className="font-mono text-sm" data-testid="account-address">
          {shortAddr(address)}
        </span>
        <button
          onClick={() => disconnect()}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          data-testid={`connect-${connector.id}`}
          disabled={isPending}
          onClick={() =>
            connect({
              connector,
              // The mock connector is only used by local e2e runs against Anvil.
              chainId: connector.id === "mock" ? chains.find((c) => c.id === 31337)?.id : undefined,
            })
          }
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium hover:bg-violet-500 disabled:opacity-50"
        >
          {connector.id === "mock" ? "Connect (Mock)" : `Connect ${connector.name}`}
        </button>
      ))}
    </div>
  );
}
