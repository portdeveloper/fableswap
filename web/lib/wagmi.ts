import { http, createConfig } from "wagmi";
import { foundry, monadTestnet } from "wagmi/chains";
import { injected, mock } from "wagmi/connectors";

// The mock connector lets automated e2e tests drive real transactions against
// Anvil (which auto-signs for its unlocked dev accounts) without a wallet
// extension. Never enabled unless explicitly opted in.
const enableMock = process.env.NEXT_PUBLIC_ENABLE_MOCK_WALLET === "1";

export const config = createConfig({
  chains: [monadTestnet, foundry],
  connectors: [
    injected(),
    ...(enableMock
      ? [
          mock({
            accounts: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
            features: { defaultConnected: false },
          }),
        ]
      : []),
  ],
  transports: {
    [monadTestnet.id]: http(),
    [foundry.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
});

export type SupportedChainId = (typeof config)["chains"][number]["id"];

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
