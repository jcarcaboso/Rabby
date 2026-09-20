export type PortfolioAccount = { address: string; alianName?: string };

export type PortfolioListEntry<Account extends PortfolioAccount> =
  | {
      kind: 'portfolio';
      id: string;
      name: string;
      pinned: boolean;
      accounts: Account[];
    }
  | { kind: 'account'; account: Account };

const matchesAccount = (account: PortfolioAccount, keyword: string) =>
  account.address.toLowerCase() === keyword ||
  !!account.alianName?.toLowerCase().includes(keyword) ||
  (keyword.replace(/^0x/, '').length >= 2 &&
    account.address.toLowerCase().includes(keyword));

export const buildPortfolioList = <Account extends PortfolioAccount>({
  accounts,
  portfolios,
  membershipByAddress,
  isAccountPinned,
  keyword = '',
}: {
  accounts: Account[];
  portfolios: Record<string, { name: string; pinned: boolean }>;
  membershipByAddress: Record<string, string>;
  isAccountPinned(account: Account): boolean;
  keyword?: string;
}): PortfolioListEntry<Account>[] => {
  const search = keyword.trim().toLowerCase();
  const folders = Object.entries(portfolios).map(([id, portfolio]) => {
    const members = accounts.filter(
      (account) => membershipByAddress[account.address.toLowerCase()] === id
    );
    const folderMatches =
      !!search && portfolio.name.toLowerCase().includes(search);
    const visibleMembers =
      !search || folderMatches
        ? members
        : members.filter((account) => matchesAccount(account, search));
    return {
      kind: 'portfolio' as const,
      id,
      ...portfolio,
      accounts: [
        ...visibleMembers.filter(isAccountPinned),
        ...visibleMembers.filter((account) => !isAccountPinned(account)),
      ],
      visible: !search || folderMatches || visibleMembers.length > 0,
    };
  });
  const ungrouped = accounts.filter(
    (account) => !membershipByAddress[account.address.toLowerCase()]
  );
  const visibleUngrouped = search
    ? ungrouped.filter((account) => matchesAccount(account, search))
    : ungrouped;
  const result: PortfolioListEntry<Account>[] = [];
  [true, false].forEach((pinned) => {
    folders
      .filter((folder) => folder.pinned === pinned && folder.visible)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(({ visible: _visible, ...folder }) => result.push(folder));
    visibleUngrouped
      .filter((account) => isAccountPinned(account) === pinned)
      .forEach((account) => result.push({ kind: 'account', account }));
  });
  return result;
};
