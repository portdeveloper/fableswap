import type { Address } from "viem";
import type { SupportedChainId } from "@/lib/wagmi";

export type TokenInfo = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
};

export type Deployment = {
  factory: Address;
  router: Address;
  tokens: [TokenInfo, TokenInfo];
};

// Anvil addresses are deterministic for the default deployer (account #0)
// starting at nonce 0: Factory, Router, WMON, USDC in deployment order.
export const deployments: Partial<Record<SupportedChainId, Deployment>> = {
  31337: {
    factory: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    router: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    tokens: [
      {
        address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        symbol: "WMON",
        name: "Wrapped Monad (Demo)",
        decimals: 18,
      },
      {
        address: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
        symbol: "USDC",
        name: "USD Coin (Demo)",
        decimals: 18,
      },
    ],
  },
  10143: {
    factory: "0x514d4aD259143c4a6bE7C2399D46CBe8B1F9E2Db",
    router: "0xf2E7885d6566394550B0daeCF45d7E822dE41cc5",
    tokens: [
      {
        address: "0x6d427a189325473725c89Ed13Cb734cFAcbD75A6",
        symbol: "WMON",
        name: "Wrapped Monad (Demo)",
        decimals: 18,
      },
      {
        address: "0x0AC0B00Cf3E7aB4B287a99c907C93f74bd73e737",
        symbol: "USDC",
        name: "USD Coin (Demo)",
        decimals: 18,
      },
    ],
  },
};
