import {
  createAccountPortfoliosStore,
  initializeAccountPortfoliosStore,
} from '@/ui/state/accountPortfolios';
import { onWalletReconnect, wallet } from '@/ui/wallet';

jest.mock('@/ui/wallet', () => ({
  wallet: {
    getStorageSnapshot: jest.fn(),
    setStorageItem: jest.fn(),
    createAccountPortfolio: jest.fn(),
    renameAccountPortfolio: jest.fn(),
    setAccountPortfolioPinned: jest.fn(),
    removeAccountPortfolio: jest.fn(),
    setAccountPortfolioMembership: jest.fn(),
  },
  onWalletReconnect: jest.fn(() => () => undefined),
}));

const snapshot = {
  origin: 'background-1',
  revision: 1,
  state: {
    portfolios: { long: { name: 'Long term', pinned: false } },
    membershipByAddress: { '0xabc': 'long' },
  },
};

describe('account portfolio store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enables commands only after a successful snapshot', async () => {
    (wallet.getStorageSnapshot as jest.Mock).mockResolvedValueOnce(snapshot);
    const store = createAccountPortfoliosStore();

    expect(store.getState()).toMatchObject({ ready: false, loadError: false });
    await initializeAccountPortfoliosStore(store);

    expect(wallet.getStorageSnapshot).toHaveBeenCalledWith('accountPortfolios');
    expect(store.getState()).toMatchObject({
      ...snapshot.state,
      ready: true,
      loadError: false,
    });
    expect(typeof store.getState().createPortfolio).toBe('function');
    store.persist.destroy();
  });

  it('stays disabled after failure and recovers on reconnect', async () => {
    const error = new Error('Stored portfolio data is invalid');
    (wallet.getStorageSnapshot as jest.Mock).mockRejectedValueOnce(error);
    const store = createAccountPortfoliosStore();

    await expect(initializeAccountPortfoliosStore(store)).rejects.toBe(error);
    expect(store.getState()).toMatchObject({ ready: false, loadError: true });

    (wallet.getStorageSnapshot as jest.Mock).mockResolvedValueOnce(snapshot);
    const reconnect = (onWalletReconnect as jest.Mock).mock.calls[0][0];
    reconnect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState()).toMatchObject({ ready: true, loadError: false });
    expect(store.getState().portfolios).toEqual(snapshot.state.portfolios);
    expect(typeof store.getState().createPortfolio).toBe('function');
    store.persist.destroy();
  });

  it('uses domain commands without generic store writes', async () => {
    (wallet.getStorageSnapshot as jest.Mock).mockResolvedValueOnce(snapshot);
    (wallet.createAccountPortfolio as jest.Mock).mockResolvedValueOnce('new');
    const store = createAccountPortfoliosStore();
    await initializeAccountPortfoliosStore(store);

    await expect(store.getState().createPortfolio('Trading')).resolves.toBe(
      'new'
    );
    expect(wallet.createAccountPortfolio).toHaveBeenCalledWith('Trading');
    expect(wallet.setStorageItem).not.toHaveBeenCalled();
    store.persist.destroy();
  });
});
