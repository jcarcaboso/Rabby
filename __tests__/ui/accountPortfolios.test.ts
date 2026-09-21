import { buildPortfolioList } from '@/ui/component/AccountPortfolioList/buildPortfolioList';

const accounts = [
  { address: '0x1', alianName: 'Alice', pinned: false },
  { address: '0x2', alianName: 'Bob', pinned: true },
  { address: '0x3', alianName: 'Carol', pinned: true },
];

const build = (keyword = '') =>
  buildPortfolioList({
    accounts,
    portfolios: {
      beta: { name: 'Trading', pinned: false },
      alpha: { name: 'Long term', pinned: true },
    },
    membershipByAddress: { '0x1': 'alpha', '0x2': 'alpha' },
    isAccountPinned: (account) => account.pinned,
    keyword,
  });

describe('account portfolio presentation', () => {
  it('orders pinned folders and ungrouped accounts without duplicating members', () => {
    const result = build();

    expect(
      result.map((entry) =>
        entry.kind === 'portfolio' ? entry.id : entry.account.address
      )
    ).toEqual(['alpha', '0x3', 'beta']);
    expect(result[0]).toMatchObject({
      kind: 'portfolio',
      accounts: [{ address: '0x2' }, { address: '0x1' }],
    });
  });

  it('reveals a matching child and its folder', () => {
    const result = build('Alice');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'portfolio',
      id: 'alpha',
      accounts: [{ address: '0x1' }],
    });
  });

  it('reveals all folder members when the folder name matches', () => {
    expect(build('long')[0]).toMatchObject({
      kind: 'portfolio',
      id: 'alpha',
      accounts: [{ address: '0x2' }, { address: '0x1' }],
    });
  });
});
