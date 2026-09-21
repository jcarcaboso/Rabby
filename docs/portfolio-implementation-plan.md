# Account portfolios implementation plan

Status: implemented and verified on `feat/account-portfolio-folders`. See [verification results and screenshots](portfolio-verification.md). Based on revision `66c312834b2706232adb9a1b1a67b9eb7644f9a8`. The scope is folders in the existing account list, with pin controls. Terms are defined in [CONTEXT.md](../CONTEXT.md).

## Product behavior

A portfolio is a named, expandable folder containing existing accounts from any seed or supported wallet type. Folders and ungrouped account rows appear together in the account list. Clicking a folder expands or collapses it. Clicking an account selects it exactly as today.

```text
Current account: Account B

v Long term                 [pin] [menu]
    Account A, Seed 1       [pin]
    Account B, Seed 2       [pin]
> Trading                   [pin] [menu]
Account C, ungrouped         [pin]
```

The sketch shows controls, not final visual styling. Reuse Rabby's existing pin icons and account rows. Keep individual account balances, badges, and actions. There is no separate portfolio page, portfolio selector/filter mode, combined balance, or new balance-fetching work.

The existing current-account header remains visible even when its folder is collapsed. Opening, collapsing, pinning, or editing a folder never changes the current account or signer.

## Membership rules

| Operation | Behavior |
| --- | --- |
| Create folder | Enter a name, then move existing accounts into it; empty folders are allowed |
| Add or move account | An address belongs to at most one portfolio; explicitly move an already-assigned address instead of copying it |
| Different seeds | Accounts from different seeds can share a folder; keys and seed relationships do not change |
| Remove member | Return it to the ungrouped account list |
| Delete folder | Confirm that the folder is removed and its accounts become ungrouped; never delete accounts or keys |
| Rename folder | Change its display name without changing membership or pin state |
| New account | Use existing create/import flows; new addresses start ungrouped |
| Hide account | Keep membership while respecting the existing account visibility rules |
| Remove wallet account | Clear membership only after the last wallet record for that address is gone |

Removing a portfolio is explicitly a grouping-only operation. Suggested confirmation: "Remove portfolio 'Long term'? Its accounts will remain in your wallet and appear ungrouped." Use **Remove portfolio** for the action, not **Delete accounts**. Preserve account names, pins, balances, keys, and current selection. The handler must update only portfolio metadata and must never call account-removal or keyring-removal methods.

Name validation: trim whitespace, require 1–50 characters, and reject case-insensitive duplicate portfolio names.

Use normalized EVM addresses for membership. Rabby's [Account type](../src/background/service/preference.ts) includes address, type, and brand, and [keyring enumeration](../src/background/service/keyring/index.ts) can return multiple wallet records for one address. Those records share a folder assignment, but retain their original identity, labels, capabilities, and account actions. Do not deduplicate signer records or pick a signer based only on an address. Importing another representation of an already-grouped address inherits its membership.

## Pinning and ordering

Add a pin/unpin button to each folder header, using the same icon and interaction style as existing account pins. Keep account pin buttons and their saved state. Folder pin state is separate from account pin state.

Ordering makes pins useful without duplicating account rows:

1. At the top level, show pinned folders and pinned ungrouped accounts before unpinned entries. Within each of these two sections, show folders first, followed by ungrouped accounts.
2. Sort folders alphabetically within their pinned/unpinned section. Keep the existing account ordering among ungrouped rows.
3. Inside a folder, show pinned accounts before unpinned accounts and retain the existing ordering within each set.
4. Pinning an account inside a folder keeps it inside that folder. It does not produce a second top-level shortcut or pin the folder automatically.
5. Moving an account preserves its existing account pin. Deleting a folder returns pinned members to the pinned ungrouped rows.

Clicking a pin must not expand the folder or switch accounts. Give the icon button an accessible Pin/Unpin label and pressed state. Expansion gets a separate button with `aria-expanded`. Support keyboard activation and focus in the account list.

Keep existing account pin persistence in [addressManagement](../src/ui/state/addressManagement.ts) and the existing highlighted-address service methods. Do not migrate account pins into the new portfolio store. Existing pins use address and brand identity; portfolio membership uses normalized address. These are deliberately separate.

## Search, expansion, and existing views

With no folders, render the current account list and its ordering unchanged. Once folders exist, partition existing visible account rows into their folder or the ungrouped list. Keep all accounts available in the same screen; there is no selected-portfolio state.

Search matches account names and addresses as today, and also folder names. An account match reveals its parent folder and matching rows. A folder-name match reveals its visible members. Temporarily expand search results without changing the user's ordinary expansion state. Clearing search restores that state.

Keep expansion state local to each open UI in the first version. On initial opening, expand the folder containing the current account. Users can collapse it afterward. Names, membership, and folder pins persist across restarts and synchronize across windows; expansion need not.

Use one shared folder-row/section presentation in the popup account list and the desktop account browsing list. Preserve each view's existing account-type eligibility. The [desktop list](../src/ui/component/DesktopSelectAccountList/index.tsx) currently excludes watch-only accounts; do not silently enable unsupported desktop operations. Existing watch-only accounts remain groupable in the ordinary account list. A folder with no eligible visible members in a view can show an empty state without exposing hidden accounts.

Keep portfolio presentation out of signing approval dialogs, dapp account permissions, transaction account pickers, and specialized trading selectors. Account browsing and switching continue to pass the full original account record through `changeAccountAsync`.

## Architecture and storage

The best fit remains a small background-owned metadata service with a synchronized UI mirror. This supports popup/desktop consistency and restart persistence without changing keyrings, the account model, or backend APIs. Use `accountPortfolios` as the module/store name to distinguish folders from existing DeFi portfolio rendering.

```ts
type AccountPortfoliosState = {
  portfolios: Record<string, { name: string; pinned: boolean }>;
  membershipByAddress: Record<string, string>; // normalized address -> portfolio ID
};
```

Use empty records as defaults and the existing `nanoid` dependency for IDs. Folder pins default to false. Infer types from a Zod schema. Do not persist duplicated account objects, balances, secrets, current-account state, or transient dialog/expansion state.

Expose background commands for create, rename, set pinned, delete, assign/move, and unassign. Send an explicit desired pin value rather than a toggle, so retries cannot flip it twice. Commands read current background state, validate the full result, and apply one patch. Assignment changes include the expected previous portfolio ID so stale moves/removals reject instead of overwriting unseen edits. Serialize mutations that perform asynchronous account checks. Reject edits while locked or before account restoration completes.

Do not send entire UI-owned maps for single edits. Reuse the [store synchronization infrastructure](../src/ui/state/createStore/createExtensionStoreOptions.ts), including snapshots, origin/revision checks, and reconnect hydration. The [contact-book UI store](../src/ui/state/contactBook.ts) demonstrates a mirrored store whose mutations happen through domain methods. Guard generic writes so they cannot bypass the portfolio commands. Follow the [Rabby store skill](../skills/rabby-create-store/SKILL.md).

The shared [persistence helper](../src/background/utils/persistStore.ts) schedules storage writes separately from state changes. Verify save failures and restart persistence; add only the smallest scoped write/error handling needed before claiming an acknowledged edit is durable. Avoid a general persistence rewrite.

## Files and integration points

| Area | Change |
| --- | --- |
| `src/background/service/accountPortfolios.ts` | Schema, names, folder pins, membership commands, cleanup |
| [service exports](../src/background/service/index.ts) and [startup](../src/background/index.ts) | Initialize the new service; isolate a loading failure from normal wallet startup |
| [wallet controller](../src/background/controller/wallet.ts) | Domain commands, snapshots, account-removal cleanup |
| [PersistedStoreMap](../src/types/persistedStore.ts) | Register the new store for typed synchronization |
| `src/ui/state/accountPortfolios.ts` | Authoritative mirror and command actions |
| [business-store initialization](../src/ui/state/initializeBizStores.ts) | Hydration and reconnect support |
| [AddressManagement](../src/ui/views/AddressManagement/index.tsx) and [DesktopSelectAccountList](../src/ui/component/DesktopSelectAccountList/index.tsx) | Folder sections, pin controls, search, and existing account rows |
| Shared account-list components | Folder header, create/rename dialog, move-to-folder action; avoid a separate management page |
| [useAccounts](../src/ui/hooks/useAccounts.ts) | Reuse existing data and ordering; compose folder presentation locally rather than changing every caller |
| [_raw/locales](../_raw/locales/) | Folder labels, accessible button labels, confirmations, errors, and empty states, following the [translation skill](../skills/rabby-i18n-translation/SKILL.md) |

Use a visible folder selector below each account row. Drag-and-drop, nesting, manual folder ordering, export, and cloud sync are outside the first version.

## Account lifecycle and failure handling

Existing installations start with no folders or assignments. Preserve all account pins, aliases, current selection, sorting preferences, and keyrings. Seed recovery alone does not restore this local organization metadata.

The [removeAddress controller](../src/background/controller/wallet.ts) already checks whether any wallet record still holds an address before clearing address-level metadata. Add portfolio cleanup there and inspect bulk deletion, seed/keyring removal, and reset paths for equivalent cleanup.

Never prune membership from a filtered or visible list, or from an empty in-memory keyring list while locked. Clean up membership after confirmed account/keyring deletions. Do not prune during unlock: the existing unlock path can report an unlocked state even when restoration failed. Deleting a folder in another window removes its header and exposes its surviving members as ungrouped, without changing the current account.

If portfolio data cannot load, keep the ordinary account list usable and disable portfolio edits. Do not overwrite unknown or malformed stored data with editable empty defaults. Preserve it for recovery and report the loading error.

## Implementation sequence

1. Add the background metadata service and focused tests for exclusive membership, folder pins, validation, moves, and deletion.
2. Wire persistence and the UI mirror; verify independent edits from two windows and restart recovery.
3. Add shared folder sections and management controls to the account browsing lists. Reuse existing account rows and pins; implement scoped ordering, expansion, and search.
4. Run account-lifecycle regressions and the disposable-wallet browser smoke test. Review the final UI in both popup and desktop sizes.

No combined-balance service, portfolio route, API adapter, account migration, or keyring refactor is part of this implementation.

## Acceptance tests

| Scenario | Expected result |
| --- | --- |
| No portfolios | Existing list, pin state, sorting, search, and account actions behave as before |
| Cross-seed membership | Accounts from different seeds share an expandable folder |
| Exclusive membership | Moving an address removes its prior assignment; address casing cannot create another membership |
| Mixed list | Folders and ungrouped accounts are visible together; grouped records are not duplicated at top level |
| Folder pin | Moves the folder into the pinned section; survives restart and synchronizes to another window |
| Account pin | Existing state survives grouping; pinned members lead their folder without creating shortcuts outside it |
| Independent controls | Pinning never changes selection or expansion; expanding never switches accounts |
| Search | Matching accounts reveal their parent folders; clearing search restores prior expansion |
| Rename/delete | Rename retains pin and membership; delete returns members with account pins intact |
| Grouping-only removal | Assert that account/keyring removal methods are never called and all account records, aliases, pins, and current selection are unchanged |
| Duplicate wallet representations | Same address shares membership; original type/brand identity and signer choice remain available |
| Hide/unhide and last-account removal | Hidden membership survives; removal of the final wallet record cleans up its assignment |
| Lock and restart | No membership is erased from a temporarily empty keyring list; metadata restores after unlock |
| Concurrent windows | Independent edits survive; stale moves reject; no orphan assignments appear |
| Save/load failure | Error is visible, unknown state is not overwritten, and ordinary account browsing remains usable |
| Keyboard and screen readers | Folder expansion and pin buttons have accessible labels and predictable focus |
| Account operations | Clicking a child uses the existing switch path; sends and approvals continue with the same individual account |

Repeat the [wallet smoke test](wallet-smoke-test.md) with fresh disposable accounts under two seeds. Create two folders, assign cross-seed members, pin a folder and a child, collapse/search/reopen, move a pinned child, delete its folder, and check two windows plus a browser restart. No funded transaction is needed to establish grouping behavior; existing wallet transaction regressions remain relevant.

Run expensive checks sequentially under the established hard limits: focused tests at 4 GiB, static checks separately, development build at 7 GiB, then browser at 2 GiB. Keep no-swap container limits. The known Ledger Jest loader failure and unverified production build remain baseline follow-ups, not evidence of a portfolio defect. See the verification record for results from this implementation.

Preserve the [wallet security invariants](../AGENTS.md). Folder actions are never account selection or consent. Approval binding, session boundaries, fail-closed signing, broadcast semantics, and the approval-queue whitelist stay under the existing wallet flows.

## Definition of done

Users can organize accounts into exclusive, expandable, pinnable folders alongside ungrouped accounts. Existing account pins and account operations remain available. Names, membership, and folder pins survive restart and synchronize across windows. Deleting a folder cannot delete wallet accounts. Focused grouping tests and the disposable browser regression pass, with unrelated baseline failures reported separately.
