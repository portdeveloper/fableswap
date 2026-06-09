"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { shortAddr } from "@/lib/format";

/// Write + receipt tracking + cache invalidation in one place. Components call
/// `write(...)` like writeContractAsync and render <TxStatus {...tx} />.
export function useTrackedWrite(label?: string) {
  const queryClient = useQueryClient();
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  // Refresh all onchain reads (balances, reserves, allowances) once mined.
  useEffect(() => {
    if (receipt.isSuccess) queryClient.invalidateQueries();
  }, [receipt.isSuccess, queryClient]);

  return {
    write: writeContractAsync,
    hash,
    isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: error ?? receipt.error,
    reset,
    label,
  };
}

export type TrackedWrite = ReturnType<typeof useTrackedWrite>;

export function TxStatus({ tx }: { tx: TrackedWrite }) {
  if (tx.error) {
    const message = tx.error.message.split("\n")[0];
    return (
      <p className="text-xs text-red-400 break-all" data-testid="tx-error">
        {message.length > 160 ? message.slice(0, 160) + "…" : message}
      </p>
    );
  }
  if (tx.isPending)
    return <p className="text-xs text-amber-400">Waiting for wallet signature…</p>;
  if (tx.isConfirming)
    return (
      <p className="text-xs text-amber-400" data-testid="tx-confirming">
        Confirming {tx.hash ? shortAddr(tx.hash) : ""}…
      </p>
    );
  if (tx.isSuccess)
    return (
      <p className="text-xs text-emerald-400" data-testid="tx-success">
        Confirmed {tx.hash ? shortAddr(tx.hash) : ""} ✓
      </p>
    );
  return null;
}
