# Wallet account organization

Vocabulary for the account portfolio feature. These definitions describe account organization, not changes to signing authority.

## Language

**Account portfolio**:
A user-named folder in the account list, containing accounts from any seed phrase or supported wallet type. An account belongs to at most one account portfolio.
_Avoid_: Seed group, keyring, protocol position.

**Portfolio removal**:
Removal of a portfolio's grouping only. Its accounts remain in the wallet as ungrouped accounts, with their names and pins intact.

**Ungrouped account**:
An existing wallet account that belongs to no account portfolio. It remains available for the wallet's normal operations.

**Pinned portfolio**:
An account portfolio marked for priority placement in the account list. Pinning a portfolio does not pin its member accounts.

**Current account**:
The individual wallet account selected for account-specific operations. An account portfolio is never a current account or a signer.

**Seed phrase**:
The recovery material for a set of derived accounts. Portfolio membership does not change an account's seed phrase or recovery material.

**Protocol position**:
An account's holdings, debts, or rewards in a DeFi protocol. Existing Rabby portfolio rendering code uses portfolio terminology for these positions; they are distinct from the new account portfolios.
