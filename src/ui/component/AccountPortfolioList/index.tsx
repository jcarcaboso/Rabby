import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as RcIconPinned } from '@/ui/assets/icon-pinned.svg';
import { ReactComponent as RcIconPinnedFill } from '@/ui/assets/icon-pinned-fill.svg';
import ThemeIcon from '@/ui/component/ThemeMode/ThemeIcon';
import { useAccountPortfoliosStore } from '@/ui/state/accountPortfolios';
import { Input, message, Modal } from 'antd';
import { buildPortfolioList, PortfolioAccount } from './buildPortfolioList';

export { buildPortfolioList } from './buildPortfolioList';

export function AccountPortfolioList<Account extends PortfolioAccount>({
  accounts,
  currentAddress,
  isAccountPinned,
  renderAccount,
  keyword = '',
  desktop = false,
}: {
  accounts: Account[];
  currentAddress?: string;
  isAccountPinned(account: Account): boolean;
  renderAccount(account: Account): React.ReactNode;
  keyword?: string;
  desktop?: boolean;
}) {
  const { t } = useTranslation();
  const portfolios = useAccountPortfoliosStore((state) => state.portfolios);
  const membershipByAddress = useAccountPortfoliosStore(
    (state) => state.membershipByAddress
  );
  const actions = useAccountPortfoliosStore.getState();
  const loadError = useAccountPortfoliosStore((state) => state.loadError);
  const ready = useAccountPortfoliosStore((state) => state.ready);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const initiallyExpanded = React.useRef(false);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const entries = useMemo(
    () =>
      buildPortfolioList({
        accounts,
        portfolios,
        membershipByAddress,
        isAccountPinned,
        keyword,
      }),
    [accounts, portfolios, membershipByAddress, isAccountPinned, keyword]
  );

  useEffect(() => {
    if (!currentAddress || initiallyExpanded.current) return;
    const portfolioId = membershipByAddress[currentAddress.toLowerCase()];
    if (portfolioId) {
      initiallyExpanded.current = true;
      setExpanded((value) => ({ ...value, [portfolioId]: true }));
    }
  }, [currentAddress, membershipByAddress]);

  return (
    <div className={desktop ? '' : 'px-[20px]'}>
      {entries.map((entry) => {
        if (entry.kind === 'account') {
          return (
            <div
              className="relative"
              key={`${entry.account.address}-${accounts.indexOf(
                entry.account
              )}`}
            >
              {renderAccount(entry.account)}
              {!!Object.keys(portfolios).length && (
                <MembershipSelect
                  address={entry.account.address}
                  portfolioId={null}
                  portfolios={portfolios}
                  disabled={!ready || loadError}
                />
              )}
            </div>
          );
        }
        const searchActive = !!keyword.trim();
        const isExpanded = searchActive || !!expanded[entry.id];
        return (
          <section key={entry.id} className="mb-[12px]">
            <div className="flex items-center min-h-[44px] rounded-[12px] bg-r-neutral-card-1 px-[12px]">
              <button
                type="button"
                aria-expanded={isExpanded}
                data-testid={`portfolio-toggle-${entry.id}`}
                aria-label={t('component.AccountPortfolioList.toggle', {
                  name: entry.name,
                })}
                className="flex flex-1 items-center gap-[8px] min-w-0 text-left"
                onClick={() =>
                  setExpanded((value) => ({
                    ...value,
                    [entry.id]: !isExpanded,
                  }))
                }
              >
                <span aria-hidden>{isExpanded ? '⌄' : '›'}</span>
                <span className="truncate font-medium">{entry.name}</span>
                <span className="text-r-neutral-foot text-12">
                  {entry.accounts.length}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={entry.pinned}
                data-testid={`portfolio-pin-${entry.id}`}
                aria-label={t(
                  entry.pinned
                    ? 'component.AccountPortfolioList.unpin'
                    : 'component.AccountPortfolioList.pin',
                  { name: entry.name }
                )}
                className="p-[8px]"
                disabled={busy || !ready || loadError}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await actions.setPortfolioPinned(entry.id, !entry.pinned);
                  } catch (error) {
                    message.error(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <ThemeIcon
                  className="w-[14px] h-[14px]"
                  src={entry.pinned ? RcIconPinnedFill : RcIconPinned}
                />
              </button>
              <button
                type="button"
                className="p-[8px] text-r-neutral-foot"
                aria-label={t('component.AccountPortfolioList.rename', {
                  name: entry.name,
                })}
                data-testid={`portfolio-rename-${entry.id}`}
                disabled={busy || !ready || loadError}
                onClick={() => setRename({ id: entry.id, name: entry.name })}
              >
                ✎
              </button>
              <button
                type="button"
                className="p-[8px] text-r-neutral-foot"
                aria-label={t('component.AccountPortfolioList.remove', {
                  name: entry.name,
                })}
                data-testid={`portfolio-remove-${entry.id}`}
                disabled={busy || !ready || loadError}
                onClick={() =>
                  Modal.confirm({
                    title: t('component.AccountPortfolioList.removeTitle'),
                    content: t('component.AccountPortfolioList.removeConfirm', {
                      name: entry.name,
                    }),
                    okText: t('component.AccountPortfolioList.removeAction'),
                    cancelText: t('global.Cancel'),
                    onOk: () =>
                      actions.removePortfolio(entry.id).catch((error) => {
                        message.error(String(error));
                        throw error;
                      }),
                  })
                }
              >
                ×
              </button>
            </div>
            {isExpanded && (
              <div className="pl-[12px] pt-[8px]">
                {entry.accounts.length ? (
                  entry.accounts.map((account) => (
                    <div
                      key={`${account.address}-${accounts.indexOf(account)}`}
                      className="relative"
                    >
                      {renderAccount(account)}
                      <MembershipSelect
                        address={account.address}
                        portfolioId={entry.id}
                        portfolios={portfolios}
                        disabled={!ready || loadError}
                      />
                    </div>
                  ))
                ) : (
                  <div className="py-[12px] text-12 text-r-neutral-foot">
                    {t('component.AccountPortfolioList.empty')}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
      <PortfolioNameModal
        open={!!rename}
        title={t('component.AccountPortfolioList.renamePrompt')}
        initialValue={rename?.name || ''}
        onCancel={() => setRename(null)}
        onSubmit={async (name) => {
          if (!rename) return;
          await actions.renamePortfolio(rename.id, name);
          setRename(null);
        }}
      />
    </div>
  );
}

export function CreatePortfolioButton() {
  const { t } = useTranslation();
  const createPortfolio = useAccountPortfoliosStore(
    (state) => state.createPortfolio
  );
  const loadError = useAccountPortfoliosStore((state) => state.loadError);
  const ready = useAccountPortfoliosStore((state) => state.ready);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="create-portfolio"
        disabled={!ready || loadError}
        className="text-r-blue-default disabled:opacity-50 whitespace-nowrap"
        onClick={() => setOpen(true)}
      >
        {t('component.AccountPortfolioList.create')}
      </button>
      {loadError && (
        <span role="status" className="ml-[8px] text-12 text-r-red-default">
          {t('component.AccountPortfolioList.unavailable')}
        </span>
      )}
      <PortfolioNameModal
        open={open}
        title={t('component.AccountPortfolioList.createPrompt')}
        onCancel={() => setOpen(false)}
        onSubmit={async (name) => {
          await createPortfolio(name);
          setOpen(false);
        }}
      />
    </>
  );
}

function PortfolioNameModal({
  open,
  title,
  initialValue = '',
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initialValue?: string;
  onCancel(): void;
  onSubmit(name: string): Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(initialValue), [initialValue, open]);
  const submit = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name);
    } catch (error) {
      message.error(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      visible={open}
      title={title}
      okText={t('global.confirm')}
      cancelText={t('global.Cancel')}
      confirmLoading={busy}
      closable={!busy}
      cancelButtonProps={{ disabled: busy }}
      okButtonProps={{ disabled: busy || !name.trim() }}
      onCancel={() => !busy && onCancel()}
      onOk={submit}
    >
      <Input
        data-testid="portfolio-name-input"
        value={name}
        maxLength={50}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onPressEnter={submit}
      />
    </Modal>
  );
}

function MembershipSelect({
  address,
  portfolioId,
  portfolios,
  disabled,
}: {
  address: string;
  portfolioId: string | null;
  portfolios: Record<string, { name: string; pinned: boolean }>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const setMembership = useAccountPortfoliosStore(
    (state) => state.setMembership
  );
  return (
    <div className="flex justify-end mt-[4px] mb-[12px]">
      <select
        aria-label={t('component.AccountPortfolioList.moveAccount')}
        className="max-w-[160px] rounded-[6px] border border-r-neutral-line bg-r-neutral-card-1 px-[8px] py-[4px] text-12 text-r-neutral-body"
        data-testid={`portfolio-membership-${address.toLowerCase()}`}
        value={portfolioId || ''}
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) =>
          setMembership(
            address,
            event.target.value || null,
            portfolioId
          ).catch((error) => message.error(String(error)))
        }
      >
        <option value="">
          {t('component.AccountPortfolioList.ungrouped')}
        </option>
        {Object.entries(portfolios).map(([id, portfolio]) => (
          <option key={id} value={id}>
            {portfolio.name}
          </option>
        ))}
      </select>
    </div>
  );
}
