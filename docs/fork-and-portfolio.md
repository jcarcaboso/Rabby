# Forking Rabby for a portfolio product

This note maps the repository's portfolio features and the work needed to turn them into either a Rabby fork or a separate read-only portfolio app. The current-state sections come from this checkout. Headings marked "Proposal" are design advice, not behavior already implemented here.

## What the current portfolio contains

The desktop profile is the most complete portfolio screen. [`src/ui/views/DesktopProfile/index.tsx`](../src/ui/views/DesktopProfile/index.tsx) composes:

- total balance, per-chain balances, and the net-worth curve through `useDesktopBalanceView`
- tokens and DeFi positions through `useTokenAndDefiData`
- NFTs through `NFTTabPane`
- transaction history through `TransactionsTabPane`
- wallet actions such as send, receive, swap, NFT transfer, approvals, Safe queue, and address backup

The popup has a smaller version. Clicking the balance card opens the common `AssetList` popup. [`AssetListContainer.tsx`](../src/ui/views/CommonPopup/AssetList/AssetListContainer.tsx) combines token search, token balances, protocol positions, app-chain positions, NFT previews, low-value/LP filtering, and chain filtering. [`BalanceView.tsx`](../src/ui/views/Dashboard/components/BalanceView/BalanceView.tsx) owns the total, chart, per-chain summary, refresh action, and the jump to the desktop profile.

The main data paths are:

| Feature | UI entry and hook | Remote calls visible in this repository | Local cache/state |
| --- | --- | --- | --- |
| Total and chain balances | [`useCurrentBalance.ts`](../src/ui/hooks/useCurrentBalance.ts), [`useDesktopBalanceView.ts`](../src/ui/views/DesktopProfile/hooks/useDesktopBalanceView.ts) | The UI calls wallet-controller methods. The controller calls `getTotalBalance` and `getAppChainList` in [`wallet.ts`](../src/background/controller/wallet.ts). | Background balance cache plus a home-view cache |
| Tokens | `useQueryProjects` -> [`token.ts`](../src/ui/utils/portfolio/token.ts) | Snapshot and batched token calls are wrapped by [`tokenUtils.ts`](../src/ui/utils/portfolio/tokenUtils.ts). | Dexie token rows, a sync timestamp, and the account Zustand store used to render the list |
| DeFi positions | `useQueryProjects` -> [`usePortfolio.ts`](../src/ui/utils/portfolio/usePortfolio.ts) | `getComplexProtocolList`, then `getProtocol` for selected project IDs through [`utils.ts`](../src/ui/utils/portfolio/utils.ts) | Dexie protocol rows and a sync timestamp |
| App-chain positions | [`useAppChain.ts`](../src/ui/hooks/useAppChain.ts) | `getAppChainList` | Dexie app-chain rows and a sync timestamp |
| NFT collections | [`useNFTCollections.ts`](../src/ui/hooks/useNFTCollections.ts) | `collectionList({ id, isAll: true })` | Dexie collections and a sync timestamp |
| History | [`history.ts`](../src/db/hooks/history.ts) | `hasNewTxFrom`, `getAllTxHistory`, or paged `listTxHisotry` | Dexie history for supported account types; direct API pagination for other types |
| Asset summary | [`useSummary.ts`](../src/ui/utils/portfolio/useSummary.ts) | `getSummarizedAssetList` | React memoization only |
| Price chart | [`useCurve.ts`](../src/ui/views/Dashboard/components/BalanceView/useCurve.ts) | The controller's net-curve path ultimately calls `getNetCurve` | Background/cache wrappers used by the balance view |

Tokens, DeFi, app-chain data, NFTs, and balance use a ten-minute freshness window defined in [`src/db/constants.ts`](../src/db/constants.ts). Their hooks generally show local Dexie data first, fetch a remote snapshot next, then replace it with fresher detail. The DeFi hook limits refreshes to projects above the UI's expansion threshold and queries them in chunks of five. The shared queue in [`portfolio/utils.ts`](../src/ui/utils/portfolio/utils.ts) caps portfolio traffic at 40 concurrent tasks and 100 starts per second.

History has a different policy. [`historyDbService.ts`](../src/db/services/historyDbService.ts) checks whether new transactions exist, uses a recent-history API when the last update is under five days old, and can backfill through the all-history API. The UI reads Dexie reactively and paginates the API directly only for account types that do not use the local history database.

Local persistence is intentionally conditional. Token, DeFi, NFT, and app-chain hooks call `getAccountByAddress` and persist only account types accepted by `isFullVersionAccountType`. Other addresses can still be queried, but these hooks delete their local rows instead of treating them as durable wallet-owned data. A standalone watch-only product should choose its own rule rather than inherit this wallet/account classification by accident.

## Where the backend coupling sits

Portfolio data is not assembled from chain RPC calls in these UI hooks. It comes from `@rabby-wallet/rabby-api`, pinned to `0.9.67` in [`package.json`](../package.json), and defaults to `https://api.rabby.io` through `INITIAL_OPENAPI_URL` in [`src/constant/index.ts`](../src/constant/index.ts). [`createOpenapiClient.ts`](../src/services/openapi/createOpenapiClient.ts) creates an `OpenApiService` with the package's `WebSignApiPlugin` and the repository's fetch adapter.

The extension creates one API client in each UI JavaScript context and another in the background. [`src/ui/wallet/index.ts`](../src/ui/wallet/index.ts) hydrates the UI client's host and API identity from the background persisted store, applies broadcast updates, and rehydrates after reconnect. [`src/background/service/openapi.ts`](../src/background/service/openapi.ts) owns the persisted host, API key, and API time. It generates a UUID API key when absent. The API package and service, rather than code in this repository, define the request signing and exact HTTP routes.

This distinction matters for a fork. The TypeScript models and method names are visible, but this checkout does not contain the implementation of Rabby's hosted portfolio indexing, token metadata, protocol adapters, spam scoring, NFT aggregation, price history, or decoded transaction history. Reusing the screens does not produce those datasets by itself.

The source supports a configurable endpoint, but production initialization forces the default host. A production fork using a different backend must change that behavior in the background OpenAPI service as well as supply a compatible API contract. Treat `@rabby-wallet/rabby-api` method signatures and returned types as the client-side contract to inventory. They are not proof that an alternative backend exists or that Rabby's hosted endpoint is intended as a general third-party service.

## Where the extension coupling sits

The UI does not receive a plain data client. It calls `useWallet()`, whose value is a proxy defined in [`src/ui/wallet/createWallet.ts`](../src/ui/wallet/createWallet.ts). Controller calls cross a WebExtension port into the background. Calls are buffered until the background announces readiness and the channel reconnects with exponential backoff. The background accepts popup, notification, tab, and desktop ports and dispatches controller calls in [`src/background/index.ts`](../src/background/index.ts).

This creates several dependencies that a web portfolio cannot import unchanged:

- `useCurrentBalance` relies on background-only balance cache methods, API feature configuration, account refresh, and the Zustand account store.
- `useTokens` writes its result into the account store rather than returning wholly local hook state.
- all portfolio hooks ask the wallet controller whether an address belongs to an imported/full account before persisting data.
- current account and chain selection come from extension background state and UI stores.
- history enrichment calls a wallet-controller method to identify gas-deposit transactions.
- desktop NFT components include listing, offer acceptance, cancellation, and send flows. Those require signing and transaction state, even though the collection hook itself only reads data.
- many portfolio components mix display with actions such as send, swap, protocol links, NFT listings, approval management, desktop navigation, analytics, translation keys, and extension-specific popups.

There is still useful code below that boundary. [`src/ui/utils/portfolio/project.ts`](../src/ui/utils/portfolio/project.ts), [`assets.ts`](../src/ui/utils/portfolio/assets.ts), [`collections.ts`](../src/ui/utils/portfolio/collections.ts), [`lpToken.ts`](../src/ui/utils/portfolio/lpToken.ts), and much of [`tokenUtils.ts`](../src/ui/utils/portfolio/tokenUtils.ts) contain sorting, filtering, grouping, and display-model transforms. The protocol renderers in [`ProtocolTemplates`](../src/ui/views/CommonPopup/AssetList/ProtocolTemplates) cover lending, leveraged farming, locked positions, rewards, vesting, perpetuals, options, predictions, and several NFT-finance shapes. These are strong references for a portfolio UI, but some import extension aliases, shared design-system components, translations, chain metadata, and action hooks. Extract them behind a small data interface before trying to publish them as a reusable package.

## Two realistic product paths

### Proposal: start with a full wallet fork when signing is part of the product

Keep the existing background/UI boundary, account model, keyrings, and OpenAPI runtime. Add portfolio functionality at the desktop composition point rather than duplicating the fetch pipeline.

Concrete extension points:

1. Add derived portfolio analytics after `useTokenAndDefiData` and `useDesktopBalanceView` in [`DesktopProfile/index.tsx`](../src/ui/views/DesktopProfile/index.tsx). Examples include allocation, protocol exposure, debt ratio, and chain concentration. Reliable PnL needs cost-basis and cash-flow history beyond a current holdings snapshot.
2. Add a new portfolio tab beside tokens, NFTs, transactions, and approvals in the same route. Keep transient filters in a UI Zustand store. Persist only user preferences that must survive windows or restarts.
3. Extend the data client behind a typed adapter. If the feature needs a new Rabby-compatible endpoint, add its method/type in the API package or a separate service, then expose only the required controller operation. Avoid scattering raw `fetch` calls through React components.
4. Reuse the existing staged cache approach for expensive address datasets. Keep cache rows keyed by normalized address and chain/protocol identity, maintain an explicit freshness timestamp, render stale data while refreshing, and abort outdated address requests.
5. For write actions, keep transaction construction, simulation, approvals, and signing in the established wallet/background flow. A portfolio card should navigate into those flows rather than sign directly.

This path carries the full wallet's security and maintenance cost. New work must preserve the repository's `AGENTS.md` wallet invariants, especially approval IDs, fail-closed signing, and re-confirmation across lock, unlock, account, and chain boundaries.

### Proposal: build a separate read-only portfolio when signing is not needed

Do not start by copying `DesktopProfile` wholesale. Define a small provider interface first, for example:

```ts
interface PortfolioDataSource {
  getBalance(address: string): Promise<BalanceSnapshot>;
  getTokens(address: string, chain?: string): Promise<Token[]>;
  getProtocols(address: string): Promise<Protocol[]>;
  getNfts(address: string): Promise<Collection[]>;
  getHistory(address: string, cursor?: string): Promise<HistoryPage>;
  getNetWorthCurve(address: string): Promise<CurvePoint[]>;
}
```

Then move or adapt the pure portfolio models and protocol templates to consume those types. Replace these extension services explicitly:

| Extension concern | Standalone replacement |
| --- | --- |
| `useWallet()` port proxy | injected HTTP/indexer client |
| imported account/current account | address input, ENS/address resolver if desired, and a watchlist |
| background persisted store | browser storage or a small app database |
| Zustand account token list | query/cache state owned by the page |
| Dexie wallet-account restrictions | address-keyed cache with the product's privacy and retention policy |
| desktop/popup routes and modals | normal web routes and read-only detail drawers |
| send/swap/list/accept/cancel actions | omit them, or deep-link to a wallet connection added as a later feature |

Start with address entry, total value, a token list, and refresh status. Add chain allocation, DeFi positions, NFTs, and history as the product needs them and the data provider supports them. That scope uses public addresses and removes keyrings, password/vault code, provider injection, approval windows, hardware wallets, transaction simulation, and signing from the product. It also makes provider substitution testable because every dataset crosses one interface.

A read-only app still needs an indexed data provider. Raw JSON-RPC can fetch native balances, ERC-20 balances only with token discovery, and NFT ownership only with substantial indexing or contract enumeration. It does not reproduce Rabby's protocol positions, spam/core classifications, USD values, 90-day history, app-chain data, or decoded histories. Before implementation, validate a backend contract for each method above and its authentication, quotas, attribution, caching, and redistribution terms. Those details are outside this checkout.

## Suggested extraction order

This sequence keeps the fork useful after every step:

1. Write product-level normalized types for balance, token, protocol, collection, history, and curve data.
2. Wrap the current Rabby calls in one `PortfolioDataSource` implementation. This proves that the interface can represent the existing UI without changing behavior.
3. Move pure transforms from `ui/utils/portfolio` behind those types and add fixtures for unusual debt, NFT lending, LP, hidden-token, and app-chain cases.
4. Split read-only renderers from action controls. Protocol templates are the highest-value first extraction. NFT detail should have separate viewing and marketplace-action layers.
5. Replace current-account reads with an explicit address parameter at the feature boundary.
6. Choose and implement the standalone provider only after the adapter works against Rabby's current data shapes.

A wallet-only feature usually needs no extraction at all: extend its existing view and data path. Steps 1 through 4 become useful if you decide to share code with a separate app. For a standalone portfolio, continue through steps 5 and 6 and create a separate web entry/build rather than weakening extension assumptions inside the wallet code.

## License facts in this checkout

[`LICENSE`](../LICENSE) contains the MIT License and permits use, modification, publication, distribution, sublicensing, and sale subject to retaining its copyright and permission notice. The file separately says Rabby's brand name and logo are copyright reserved and may not be used when republishing software. [`package.json`](../package.json) also declares `"license": "MIT"`.

Those are repository facts, not legal advice. A fork should use its own name and artwork and should review the licenses and service terms of dependencies, hosted APIs, data providers, and third-party assets separately. The repository license does not state terms for `api.rabby.io`.
