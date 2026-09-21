import type { AccountPortfoliosState } from '@/background/service/accountPortfolios';
import { wallet } from '@/ui/wallet';
import { createExtensionStoreOptions } from './createStore/createExtensionStoreOptions';
import { createRabbyStore } from './createStore/createRabbyStore';
import type { RabbyStore } from './createStore/createRabbyStore';

type AccountPortfolioActions = {
  loadError: boolean;
  ready: boolean;
  createPortfolio(name: string): Promise<string>;
  renamePortfolio(id: string, name: string): Promise<void>;
  setPortfolioPinned(id: string, pinned: boolean): Promise<void>;
  removePortfolio(id: string): Promise<void>;
  setMembership(
    address: string,
    portfolioId: string | null,
    expectedPortfolioId: string | null
  ): Promise<void>;
};

export type AccountPortfoliosStore = AccountPortfoliosState &
  AccountPortfolioActions;

export const createAccountPortfoliosStore = () => {
  const store: RabbyStore<AccountPortfoliosStore> = createRabbyStore<AccountPortfoliosStore>(
    () => ({
      portfolios: {},
      membershipByAddress: {},
      loadError: false,
      ready: false,
      createPortfolio: (name) => wallet.createAccountPortfolio(name),
      renamePortfolio: (id, name) => wallet.renameAccountPortfolio(id, name),
      setPortfolioPinned: (id, pinned) =>
        wallet.setAccountPortfolioPinned(id, pinned),
      removePortfolio: (id) => wallet.removeAccountPortfolio(id),
      setMembership: (address, portfolioId, expectedPortfolioId) =>
        wallet.setAccountPortfolioMembership(
          address,
          portfolioId,
          expectedPortfolioId
        ),
    }),
    createExtensionStoreOptions<AccountPortfoliosStore, 'accountPortfolios'>({
      storageKey: 'accountPortfolios',
      autoHydrate: false,
      // Portfolio writes use checked domain commands. Generic store writes are
      // deliberately disabled in the background.
      partialize: () => ({}),
      merge(persistedState, currentState) {
        return {
          ...currentState,
          ...persistedState,
          ready: true,
          loadError: false,
        };
      },
      onError(error) {
        console.error('[accountPortfoliosStore]', error);
        store.setState({ ready: false, loadError: true });
      },
    })
  );
  return store;
};

export const useAccountPortfoliosStore = createAccountPortfoliosStore();

export const initializeAccountPortfoliosStore = (
  store = useAccountPortfoliosStore
) =>
  store.persist.hydrate().then(() => {
    store.setState({ ready: true, loadError: false });
  });
