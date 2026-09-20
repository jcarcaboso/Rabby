import { nanoid } from 'nanoid';
import { getAddress } from 'viem';
import { z } from 'zod';
import { createPersistStore, patchPersistStoreDurably } from 'background/utils';
import { storage } from 'background/webapi';
import { keyringService } from '.';

const hasOwn = (record: object, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key);

const portfolioSchema = z.object({
  name: z.string().min(1).max(50),
  pinned: z.boolean(),
});

export const accountPortfoliosStoreSchema = z
  .object({
    portfolios: z.record(z.string(), portfolioSchema).default(() => ({})),
    membershipByAddress: z.record(z.string(), z.string()).default(() => ({})),
  })
  .superRefine((state, context) => {
    for (const [address, portfolioId] of Object.entries(
      state.membershipByAddress
    )) {
      try {
        if (getAddress(address).toLowerCase() !== address) throw new Error();
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['membershipByAddress', address],
          message: 'Portfolio membership address must be normalized',
        });
      }
      if (!hasOwn(state.portfolios, portfolioId)) {
        context.addIssue({
          code: 'custom',
          path: ['membershipByAddress', address],
          message: 'Portfolio membership references a missing portfolio',
        });
      }
    }
  });

export type AccountPortfoliosState = z.output<
  typeof accountPortfoliosStoreSchema
>;

const createStoreTemplate = (): AccountPortfoliosState =>
  accountPortfoliosStoreSchema.parse({});

const normalizeAddress = (address: string) => getAddress(address).toLowerCase();

class AccountPortfoliosService {
  private store?: AccountPortfoliosState;
  private mutationChain: Promise<void> = Promise.resolve();
  private initializationError?: Error;

  init = async () => {
    try {
      const stored = await storage.get<unknown>('accountPortfolios');
      if (stored !== undefined) accountPortfoliosStoreSchema.parse(stored);

      this.store = await createPersistStore<AccountPortfoliosState>({
        name: 'accountPortfolios',
        template: createStoreTemplate(),
        schema: accountPortfoliosStoreSchema,
      });
      this.initializationError = undefined;
    } catch (error) {
      this.initializationError =
        error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  };

  getStore = () => {
    if (!this.store) {
      throw (
        this.initializationError ||
        new Error('Account portfolios are not initialized')
      );
    }
    return this.store;
  };

  patchStore = (_partials: Partial<AccountPortfoliosState>) => {
    throw new Error('Account portfolios require domain mutation methods');
  };

  private mutate = <T>(task: () => Promise<T>): Promise<T> => {
    const result = this.mutationChain.then(task);
    this.mutationChain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  private assertEditable = () => {
    const store = this.getStore();
    if (!keyringService.isUnlocked()) {
      throw new Error('Unlock the wallet to edit account portfolios');
    }
    return store;
  };

  private normalizeName = (name: string, ignoredId?: string) => {
    const normalized = name.trim();
    if (!normalized || normalized.length > 50) {
      throw new Error('Portfolio name must contain 1 to 50 characters');
    }
    const duplicate = Object.entries(this.getStore().portfolios).some(
      ([id, portfolio]) =>
        id !== ignoredId &&
        portfolio.name.toLowerCase() === normalized.toLowerCase()
    );
    if (duplicate) throw new Error('A portfolio with this name already exists');
    return normalized;
  };

  create = (name: string) =>
    this.mutate(async () => {
      const store = this.assertEditable();
      const id = nanoid();
      const normalizedName = this.normalizeName(name);
      await patchPersistStoreDurably(store, {
        portfolios: {
          ...store.portfolios,
          [id]: { name: normalizedName, pinned: false },
        },
      });
      return id;
    });

  rename = (id: string, name: string) =>
    this.mutate(async () => {
      const store = this.assertEditable();
      const portfolio = store.portfolios[id];
      if (!hasOwn(store.portfolios, id)) throw new Error('Portfolio not found');
      const normalizedName = this.normalizeName(name, id);
      await patchPersistStoreDurably(store, {
        portfolios: {
          ...store.portfolios,
          [id]: { ...portfolio, name: normalizedName },
        },
      });
    });

  setPinned = (id: string, pinned: boolean) =>
    this.mutate(async () => {
      const store = this.assertEditable();
      const portfolio = store.portfolios[id];
      if (!hasOwn(store.portfolios, id)) throw new Error('Portfolio not found');
      await patchPersistStoreDurably(store, {
        portfolios: {
          ...store.portfolios,
          [id]: { ...portfolio, pinned },
        },
      });
    });

  remove = (id: string) =>
    this.mutate(async () => {
      const store = this.assertEditable();
      if (!hasOwn(store.portfolios, id)) throw new Error('Portfolio not found');
      const portfolios = { ...store.portfolios };
      delete portfolios[id];
      const membershipByAddress = Object.fromEntries(
        Object.entries(store.membershipByAddress).filter(
          ([, portfolioId]) => portfolioId !== id
        )
      );
      await patchPersistStoreDurably(store, {
        portfolios,
        membershipByAddress,
      });
    });

  setMembership = (
    address: string,
    portfolioId: string | null,
    expectedPortfolioId: string | null
  ) =>
    this.mutate(async () => {
      const store = this.assertEditable();
      const normalizedAddress = normalizeAddress(address);
      if (portfolioId !== null && !hasOwn(store.portfolios, portfolioId)) {
        throw new Error('Portfolio not found');
      }
      const currentPortfolioId = store.membershipByAddress[normalizedAddress];
      if ((currentPortfolioId || null) !== expectedPortfolioId) {
        throw new Error('Portfolio membership changed in another window');
      }
      const accounts = await keyringService.getAllAdresses();
      if (
        !accounts.some(
          (account) => normalizeAddress(account.address) === normalizedAddress
        )
      ) {
        throw new Error('Account not found');
      }
      this.assertEditable();
      if (
        (store.membershipByAddress[normalizedAddress] || null) !==
        expectedPortfolioId
      ) {
        throw new Error('Portfolio membership changed in another window');
      }

      const membershipByAddress = { ...store.membershipByAddress };
      if (portfolioId === null) delete membershipByAddress[normalizedAddress];
      else membershipByAddress[normalizedAddress] = portfolioId;
      await patchPersistStoreDurably(store, { membershipByAddress });
    });

  removeMembershipForMissingAccount = (address: string) =>
    this.mutate(async () => {
      const store = this.store;
      if (!store) return;
      if (!keyringService.isUnlocked()) return;
      const normalizedAddress = normalizeAddress(address);
      if (!store.membershipByAddress[normalizedAddress]) return;
      if (await keyringService.hasAddress(address)) return;
      if (!keyringService.isUnlocked()) return;
      const membershipByAddress = { ...store.membershipByAddress };
      delete membershipByAddress[normalizedAddress];
      await patchPersistStoreDurably(store, { membershipByAddress });
    });

  clear = () =>
    this.mutate(async () => {
      if (this.store) {
        await patchPersistStoreDurably(this.store, createStoreTemplate());
        return;
      }

      const emptyStore = createStoreTemplate();
      await storage.set('accountPortfolios', emptyStore);
      this.store = await createPersistStore<AccountPortfoliosState>({
        name: 'accountPortfolios',
        template: emptyStore,
        schema: accountPortfoliosStoreSchema,
      });
      this.initializationError = undefined;
    });
}

export default new AccountPortfoliosService();
