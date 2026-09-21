# Wallet baseline smoke test

Use this checklist on the fork before adding portfolio account groups. It records the current account behavior that the portfolio work must preserve. The execution notes below distinguish the automated baseline from the broader manual checklist.

## Executed baseline, 2026-09-19

Source revision `66c312834b2706232adb9a1b1a67b9eb7644f9a8`. No wallet implementation changes were made. Chromium `151.0.7922.34` loaded an unpacked Chrome MV3 development build in a disposable persistent profile.

| Check | Result |
| --- | --- |
| Immutable dependency install | Passed after supplying missing Linux USB development headers with `nix-shell -p pkg-config systemd --run 'corepack yarn install --immutable'`; peer dependency warnings remain |
| `corepack yarn check` | Passed, including lint and TypeScript |
| Focused Jest run | 8 suites passed, 49 tests passed; 1 suite failed to load because Jest could not resolve `@ledgerhq/device-transport-kit-web-hid` in `keyring.test.ts` |
| Production build | Unverified. The initial attempt exhausted host memory during minification. Do not repeat its unrestricted 12 GiB heap configuration on this shared host |
| Development build | Passed, with two dynamic-dependency warnings in `ox/tempo/internal/virtualMasterPool.js` |
| Fresh wallet through onboarding UI | Passed; A1 `0xe85a7e...ca776a` |
| Add account under the same seed through UI | Passed; A2 `0xb913ef...e34817` |
| Create a second seed through UI | Passed; B1 `0xb7d8c8...572f25`; all three addresses appeared in the account list |
| Select A2 and reload the wallet page | Passed; A2 remained selected |
| Lock and unlock | Passed; called `lockWallet` over the normal extension controller port, checked locked state and hidden dashboard, then unlocked through the visible password form |
| Complete browser close and restart | Passed; wallet opened locked, then restored the same three addresses and A2 selection after password unlock |
| API and page errors | Observed initial API responses with HTTP 200, a zero-balance dashboard and live market data; no failed HTTP responses from `api.rabby.io` or uncaught page errors observed by the instrumented UI page |
| Seed backup and restore | Not run; no seed phrase was exported or recorded |
| Testnet transfer, dapp signing, hardware wallets | Not run |

The initial full Jest run was stopped before completion to reduce memory pressure; it is not a passing full-suite result. The focused run covered wallet boot, approval signing bindings, RPC approval guards, account state, displayed account state, wallet status, unlock approval, keyrings, and custom-testnet receipt status. It completed in 294 seconds. The Ledger dependency exists in `node_modules` but declares only an `import` entry in its export map; Jest resolution needs separate investigation. No test configuration was changed to hide the failure. These checks establish a usable development baseline, not that every wallet function works or that the production package is ready.

The automated browser opened `popup.html` as a tab. It did not test the browser toolbar popup's focus/close behavior or the extension manager's Reload button. API observation was limited to the instrumented UI page, not every background request. The generated password stayed in memory, the seed phrases stayed inside the test wallet, and removing the container discarded the profile. Never fund these discarded addresses.

## Resource limits for this host

Run installation, static checks, building, browser checks, and tests sequentially. A Node heap limit alone does not cap the memory used by the whole build process and its children.

The successful build used the existing local `homelab/jenkins-dashboard-browser-tests:1.62.0` image with Node 24.18.0. It is a machine-specific image, not a new project dependency. The container had a 7 GiB memory cap, no swap allowance, two CPUs, and a 5 GiB Node heap. It ran the existing development configuration with watch and source maps disabled. Development mode does not run the production Warden/minification pipeline.

```bash
# Run these only after preceding work has exited.
node build/clean.js
node scripts/make-theme.js
rabby_git_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
docker run --rm --name rabby-baseline-build \
  --memory=7g --memory-swap=7g --cpus=2 \
  -v "${PWD}:/workspace" \
  -v "${rabby_git_dir}:${rabby_git_dir}:ro" \
  -w /workspace -e MANIFEST_TYPE=chrome-mv3 \
  -e NODE_OPTIONS=--max-old-space-size=5120 \
  --entrypoint node homelab/jenkins-dashboard-browser-tests:1.62.0 \
  node_modules/webpack/bin/webpack.js \
  --env config=dev --no-watch --no-devtool --stats errors-warnings
```

The Git mount lets Webpack read the linked worktree's revision. The browser ran afterward in a separate container capped at 2 GiB, and the focused tests ran afterward with a 4 GiB cap and `--runInBand`. Browser automation followed Playwright's [persistent-context extension loading](https://playwright.dev/docs/chrome-extensions).

## Test data and setup

- Use a new browser profile with no other wallet extensions and load this fork as an unpacked extension.
- Let Rabby generate all seed phrases. Use the resulting wallet only for this test, never paste an existing seed phrase or private key into the fork.
- Keep seed phrases and the wallet password off screenshots, logs, issue comments, and this document. Delete the browser profile after the test.
- Record the extension commit, browser version, extension ID, and the first six and last four characters of each test address. Do not record a seed phrase or private key.
- For an optional transaction, use only faucet funds on a tester-selected custom testnet. Obtain its chain ID, RPC URL, currency symbol, explorer URL, and faucet link from that network's current official documentation. Do not use mainnet funds.

## Manual browser steps

### 1. Create a fresh wallet

1. Open the extension in the clean browser profile.
2. Select **Create a new address**.
3. On **Set Password**, enter and confirm a disposable password, accept the terms, and continue.
4. Confirm that Rabby reports **New Seed Phrase Created** and shows one address. Record only its shortened address as account A1.
5. Select **Backup Seed Phrase**, follow the on-screen backup flow in private, and finish with **I've Saved the Phrase**. Store the phrase only in temporary offline test notes.
6. Open the wallet and confirm that A1 is the current address and that the dashboard loads without an error.

The entry routes and labels come from [src/ui/views/NewUserImport/Guide.tsx](../src/ui/views/NewUserImport/Guide.tsx), [src/ui/views/NewUserImport/CreateSeedPhrase.tsx](../src/ui/views/NewUserImport/CreateSeedPhrase.tsx), [src/ui/views/NewUserImport/PasswordCard.tsx](../src/ui/views/NewUserImport/PasswordCard.tsx), and [_raw/locales/en/messages.json](../_raw/locales/en/messages.json). The success and backup actions are implemented in [src/ui/views/NewUserImport/Success.tsx](../src/ui/views/NewUserImport/Success.tsx) and [src/ui/views/NewUserImport/BackupSeedPhrase.tsx](../src/ui/views/NewUserImport/BackupSeedPhrase.tsx).

### 2. Add an account under the first seed

1. Click the current address in the dashboard header to open **Current Address**.
2. Select **Add New Address**, then **Create New Address**.
3. Expand **Seed Phrase 1** and select **Add address**. Complete password or passphrase authentication if prompted.
4. On **New Address Created**, record the shortened address as A2 and select **Done**.
5. Return to **Current Address**. Confirm that A1 and A2 both appear and retain their individual names, balances, and addresses.

The dashboard address control opens `/switch-address` in [src/ui/views/Dashboard/components/DashboardHeader/index.tsx](../src/ui/views/Dashboard/components/DashboardHeader/index.tsx). The add flow and seed cards are in [src/ui/views/AddressManagement/index.tsx](../src/ui/views/AddressManagement/index.tsx), [src/ui/component/AddAddressOptions/index.tsx](../src/ui/component/AddAddressOptions/index.tsx), and [src/ui/views/AddAddress/AddNewAddress.tsx](../src/ui/views/AddAddress/AddNewAddress.tsx).

### 3. Add a second seed

1. From **Current Address**, select **Add New Address**, then **Create New Address**.
2. Select **Create a New Seed Phrase** rather than adding another address under Seed Phrase 1.
3. On **New Seed Phrase Created**, record the shortened address as B1.
4. Select **Backup Seed Phrase**, save this second disposable phrase separately, finish the backup, and return to the dashboard.
5. Reopen **Current Address** and confirm that A1, A2, and B1 all appear. Confirm that the existing address list still supports search, sorting, address details, and direct switching.

The branch creates another mnemonic keyring through `createNewSeedPhrase` in [src/ui/views/AddAddress/useCreateAddress.ts](../src/ui/views/AddAddress/useCreateAddress.ts). The current seed list and **Create a New Seed Phrase** action are rendered by [src/ui/views/AddAddress/AddNewAddress.tsx](../src/ui/views/AddAddress/AddNewAddress.tsx).

### 4. Switch accounts and preserve selection

1. In **Current Address**, select A2. Confirm that the dashboard header now shows A2.
2. Close the popup, reopen it, and confirm that A2 remains selected.
3. Select B1, close the popup, and reopen it. Confirm that B1 remains selected.
4. Open **Manage Address** and confirm that A1, A2, and B1 are present once each.

Account switching calls `changeAccountAsync` and returns to the dashboard in [src/ui/views/AddressManagement/index.tsx](../src/ui/views/AddressManagement/index.tsx). Account-state behavior has unit coverage in [__tests__/ui/accountStore.test.ts](../__tests__/ui/accountStore.test.ts) and [__tests__/ui/accountToDisplayStore.test.ts](../__tests__/ui/accountToDisplayStore.test.ts).

### 5. Restart, lock, and unlock

1. With B1 selected, open the browser's extension management page and click **Reload** for this unpacked extension. Reopen Rabby.
2. Confirm that all three addresses remain present and B1 remains the current address.
3. Open the dashboard settings with the gear icon and select **Lock Wallet**.
4. Confirm that the **Rabby Wallet** unlock page appears and that wallet data is not displayed while locked.
5. Enter the disposable password and select **Unlock**.
6. Confirm that A1, A2, and B1 remain present and that the previously selected address is still selected. Switch once more to A1 and confirm that the dashboard updates.

The settings action calls `wallet.lockWallet()` and routes to `/unlock` in [src/ui/views/Dashboard/components/Settings/index.tsx](../src/ui/views/Dashboard/components/Settings/index.tsx). Unlock behavior lives in [src/ui/views/Unlock/index.tsx](../src/ui/views/Unlock/index.tsx); status and restart behavior have focused tests in [__tests__/ui/walletStatusStore.test.ts](../__tests__/ui/walletStatusStore.test.ts) and [__tests__/background/walletBoot.test.ts](../__tests__/background/walletBoot.test.ts).

### 6. Read-only data checks

Run these checks for A1, A2, and B1. They must not prompt for a signature or password.

1. Open each address from **Current Address** and confirm that its dashboard balance and asset list load, including an empty state for an unfunded address.
2. Copy the address with Rabby's copy button and compare it with the address shown in **Manage Address**.
3. Open the browser DevTools **Network** panel, reload the wallet view, and confirm that balance and portfolio requests complete without repeated 4xx or 5xx responses. Do not copy authorization headers, full response bodies, or request URLs containing tokens into the test record.
4. If a custom testnet is configured, switch the asset selector to **Custom Network** and confirm that its native balance can be read without a signing prompt.

The dashboard reads the current account in [src/ui/views/Dashboard/components/DashboardHeader/index.tsx](../src/ui/views/Dashboard/components/DashboardHeader/index.tsx); account and balance loading are implemented in [src/ui/hooks/useAccounts.ts](../src/ui/hooks/useAccounts.ts) and [src/ui/state/accountToDisplay.ts](../src/ui/state/accountToDisplay.ts). Custom-network assets are rendered by [src/ui/views/CommonPopup/AssetList/CustomTestnetAssetList/CustomTestnetAssetListContainer.tsx](../src/ui/views/CommonPopup/AssetList/CustomTestnetAssetList/CustomTestnetAssetListContainer.tsx).

### 7. Optional funded testnet send

Skip this section unless the disposable account has faucet funds and the tester has verified the network details against current official documentation.

1. Open settings and select **Add Custom Network**.
2. Select **Add Custom Network** again. Enter the verified **Chain ID**, **Network name**, **RPC URL**, **Currency symbol**, and optional **Block explorer URL**, then save.
3. Fund A1 from the network's official faucet. Wait until Rabby displays the native balance.
4. Switch to A1 and select **Send**. Choose the custom network's native token, enter A2 as the recipient, and send the smallest practical nonzero amount while retaining enough native token for gas.
5. Review the source account, destination, network, amount, and fee in the confirmation. Reject the transaction if any field differs from the test plan.
6. Confirm the send, wait for a transaction hash, and verify that exact hash and the A1-to-A2 transfer in the network's official explorer.
7. Switch to A2 and confirm that its custom-network balance updates. Record only the public transaction hash and shortened public addresses.

Custom-network setup and fields are in [src/ui/views/CustomTestnet/index.tsx](../src/ui/views/CustomTestnet/index.tsx) and [src/ui/views/CustomTestnet/components/CustomTestnetForm.tsx](../src/ui/views/CustomTestnet/components/CustomTestnetForm.tsx). The send route and account switch guard are in [src/ui/views/SendToken/index.tsx](../src/ui/views/SendToken/index.tsx).

## Acceptance record

Mark an item **Pass**, **Fail**, or **Skipped** only after executing it. The initial state is **Not run** so this plan cannot be mistaken for evidence.

| ID | Check | Acceptance condition | Planned | Executed status | Evidence |
| --- | --- | --- | --- | --- | --- |
| W1 | Fresh wallet | A1 is created and the dashboard opens | Yes | Not run | Commit, browser version, shortened A1 |
| W2 | Same-seed account | A2 is added under Seed Phrase 1 without changing or duplicating A1 | Yes | Not run | Shortened A1 and A2 |
| W3 | Second seed | B1 is created under Seed Phrase 2 and all three addresses remain visible | Yes | Not run | Shortened B1 and redacted screenshot |
| W4 | Switching | A1, A2, and B1 can each become current and the header updates | Yes | Not run | Selection sequence |
| W5 | Popup reopen | The current account remains selected after closing and reopening the popup | Yes | Not run | Selected shortened address |
| W6 | Extension reload | Accounts and current selection survive an unpacked-extension reload | Yes | Not run | Before and after shortened address |
| W7 | Lock and unlock | Lock hides wallet data; unlock restores all accounts and the prior selection | Yes | Not run | Result only, no password |
| W8 | Read-only data | Each account loads its balance or empty state with no signing prompt or repeated API failure | Yes | Not run | Status codes or redacted screenshot |
| W9 | Testnet send | If funded, the explorer and Rabby show the same A1-to-A2 transfer and A2 balance updates | Conditional | Not run | Public transaction hash |

## Portfolio account-group requirements

The planned portfolio feature adds user-named groups to the account view. A group may contain accounts from different seed phrases. An account may belong to at most one group. Accounts with no group must keep the current ungrouped behavior, including visibility, switching, balances, search, sorting, restart persistence, and lock/unlock behavior. Re-run W1 through W9 after implementation and compare them with this baseline before adding group-specific cases.
