import accountPortfoliosService, {
  accountPortfoliosStoreSchema,
} from '@/background/service/accountPortfolios';
import { createPersistStore, patchPersistStoreDurably } from 'background/utils';
import { storage } from '@/background/webapi';
import { keyringService } from '@/background/service';

jest.mock('background/utils', () => ({
  createPersistStore: jest.fn(async ({ template }) => ({ ...template })),
  patchPersistStoreDurably: jest.fn(async (store, partials) => {
    Object.assign(store, partials);
  }),
}));

jest.mock('@/background/webapi', () => ({
  storage: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('@/background/service', () => ({
  keyringService: {
    getAllAdresses: jest.fn(),
    hasAddress: jest.fn(),
    isUnlocked: jest.fn(),
  },
}));

const alice = '0x00000000000000000000000000000000000000aa';
const bob = '0x0000000000000000000000000000000000000002';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('account portfolios service', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (storage.get as jest.Mock).mockResolvedValue(undefined);
    (keyringService.isUnlocked as jest.Mock).mockReturnValue(true);
    (keyringService.getAllAdresses as jest.Mock).mockResolvedValue([
      { address: alice },
      { address: bob },
    ]);
    (keyringService.hasAddress as jest.Mock).mockResolvedValue(false);
    (accountPortfoliosService as any).store = undefined;
    (accountPortfoliosService as any).initializationError = undefined;
    (accountPortfoliosService as any).mutationChain = Promise.resolve();
    await accountPortfoliosService.init();
  });

  test('uses the validating persisted schema and rejects generic writes', () => {
    const options = (createPersistStore as jest.Mock).mock.calls[0][0];
    expect(options.name).toBe('accountPortfolios');
    expect(options.schema).toBe(accountPortfoliosStoreSchema);
    expect(() => accountPortfoliosService.patchStore({})).toThrow(
      'domain mutation methods'
    );
  });

  test('trims names, rejects case-insensitive duplicates and persists pins', async () => {
    const id = await accountPortfoliosService.create('  Long term  ');
    expect(accountPortfoliosService.getStore().portfolios[id]).toEqual({
      name: 'Long term',
      pinned: false,
    });
    await expect(accountPortfoliosService.create('long TERM')).rejects.toThrow(
      'already exists'
    );

    await accountPortfoliosService.setPinned(id, true);
    await accountPortfoliosService.rename(id, 'Savings');
    expect(accountPortfoliosService.getStore().portfolios[id]).toEqual({
      name: 'Savings',
      pinned: true,
    });
  });

  test('rejects blank and overlong names', async () => {
    await expect(accountPortfoliosService.create('   ')).rejects.toThrow(
      '1 to 50 characters'
    );
    await expect(
      accountPortfoliosService.create('a'.repeat(51))
    ).rejects.toThrow('1 to 50 characters');
    expect(accountPortfoliosService.getStore().portfolios).toEqual({});
  });

  test('serializes independent concurrent creates without losing either folder', async () => {
    const [first, second] = await Promise.all([
      accountPortfoliosService.create('First'),
      accountPortfoliosService.create('Second'),
    ]);

    expect(first).not.toBe(second);
    expect(accountPortfoliosService.getStore().portfolios).toEqual({
      [first]: { name: 'First', pinned: false },
      [second]: { name: 'Second', pinned: false },
    });
  });

  test('normalizes membership, moves exclusively and rejects stale edits', async () => {
    const first = await accountPortfoliosService.create('First');
    const second = await accountPortfoliosService.create('Second');
    const uppercaseAlice = `0x${alice.slice(2).toUpperCase()}`;
    await accountPortfoliosService.setMembership(uppercaseAlice, first, null);
    await accountPortfoliosService.setMembership(alice, second, first);

    expect(accountPortfoliosService.getStore().membershipByAddress).toEqual({
      [alice]: second,
    });
    await expect(
      accountPortfoliosService.setMembership(alice, null, first)
    ).rejects.toThrow('another window');
  });

  test('queues concurrent assignments so a stale expected membership rejects', async () => {
    const first = await accountPortfoliosService.create('First');
    const second = await accountPortfoliosService.create('Second');
    const accounts = deferred<{ address: string }[]>();
    const lookupStarted = deferred<void>();
    (keyringService.getAllAdresses as jest.Mock).mockImplementationOnce(() => {
      lookupStarted.resolve();
      return accounts.promise;
    });

    const firstAssignment = accountPortfoliosService.setMembership(
      alice,
      first,
      null
    );
    await lookupStarted.promise;
    const staleAssignment = accountPortfoliosService.setMembership(
      alice,
      second,
      null
    );
    accounts.resolve([{ address: alice }]);

    await expect(firstAssignment).resolves.toBeUndefined();
    await expect(staleAssignment).rejects.toThrow('another window');
    expect(accountPortfoliosService.getStore().membershipByAddress).toEqual({
      [alice]: first,
    });
    expect(keyringService.getAllAdresses).toHaveBeenCalledTimes(1);
  });

  test('requires an unlocked wallet and an existing account', async () => {
    const id = await accountPortfoliosService.create('Folder');
    (keyringService.getAllAdresses as jest.Mock).mockResolvedValue([]);
    await expect(
      accountPortfoliosService.setMembership(alice, id, null)
    ).rejects.toThrow('Account not found');

    (keyringService.isUnlocked as jest.Mock).mockReturnValue(false);
    await expect(accountPortfoliosService.rename(id, 'Locked')).rejects.toThrow(
      'Unlock the wallet'
    );
  });

  test('removing a folder only removes its metadata and memberships', async () => {
    const id = await accountPortfoliosService.create('Temporary');
    await accountPortfoliosService.setMembership(alice, id, null);
    await accountPortfoliosService.remove(id);

    expect(accountPortfoliosService.getStore()).toEqual({
      portfolios: {},
      membershipByAddress: {},
    });
    expect(keyringService.getAllAdresses).toHaveBeenCalledTimes(1);
  });

  test('keeps membership until the last wallet record is removed', async () => {
    const id = await accountPortfoliosService.create('Shared');
    await accountPortfoliosService.setMembership(alice, id, null);
    (keyringService.hasAddress as jest.Mock).mockResolvedValueOnce(true);
    await accountPortfoliosService.removeMembershipForMissingAccount(alice);
    expect(accountPortfoliosService.getStore().membershipByAddress[alice]).toBe(
      id
    );

    (keyringService.hasAddress as jest.Mock).mockResolvedValueOnce(false);
    await accountPortfoliosService.removeMembershipForMissingAccount(alice);
    expect(
      accountPortfoliosService.getStore().membershipByAddress[alice]
    ).toBeUndefined();
  });

  test('skips cleanup when the wallet locks while account lookup is pending', async () => {
    const id = await accountPortfoliosService.create('Shared');
    await accountPortfoliosService.setMembership(alice, id, null);
    const hasAddress = deferred<boolean>();
    const lookupStarted = deferred<void>();
    (keyringService.hasAddress as jest.Mock).mockImplementationOnce(() => {
      lookupStarted.resolve();
      return hasAddress.promise;
    });

    const cleanup = accountPortfoliosService.removeMembershipForMissingAccount(
      alice
    );
    await lookupStarted.promise;
    (keyringService.isUnlocked as jest.Mock).mockReturnValue(false);
    hasAddress.resolve(false);
    await cleanup;

    expect(accountPortfoliosService.getStore().membershipByAddress[alice]).toBe(
      id
    );
  });

  test('preserves malformed storage and leaves snapshots unavailable', async () => {
    (accountPortfoliosService as any).store = undefined;
    (storage.get as jest.Mock).mockResolvedValue({
      portfolios: {},
      membershipByAddress: { [alice]: 'missing' },
    });
    (createPersistStore as jest.Mock).mockClear();

    await expect(accountPortfoliosService.init()).rejects.toThrow();
    expect(createPersistStore).not.toHaveBeenCalled();
    expect(() => accountPortfoliosService.getStore()).toThrow();
  });

  test('serializes failed writes without blocking later mutations', async () => {
    (patchPersistStoreDurably as jest.Mock).mockRejectedValueOnce(
      new Error('disk full')
    );
    await expect(accountPortfoliosService.create('First')).rejects.toThrow(
      'disk full'
    );
    await expect(accountPortfoliosService.create('Second')).resolves.toEqual(
      expect.any(String)
    );
  });

  test('clears malformed raw storage when abandoning the wallet', async () => {
    (accountPortfoliosService as any).store = undefined;
    (accountPortfoliosService as any).initializationError = new Error(
      'malformed'
    );

    await accountPortfoliosService.clear();

    expect(storage.set).toHaveBeenCalledWith('accountPortfolios', {
      portfolios: {},
      membershipByAddress: {},
    });
    expect(accountPortfoliosService.getStore()).toEqual({
      portfolios: {},
      membershipByAddress: {},
    });
  });

  test('rejects a failed clear without changing loaded state', async () => {
    const id = await accountPortfoliosService.create('Keep');
    await accountPortfoliosService.setMembership(alice, id, null);
    const before = JSON.parse(
      JSON.stringify(accountPortfoliosService.getStore())
    );
    (patchPersistStoreDurably as jest.Mock).mockRejectedValueOnce(
      new Error('disk full')
    );

    await expect(accountPortfoliosService.clear()).rejects.toThrow('disk full');
    expect(accountPortfoliosService.getStore()).toEqual(before);
  });
});
