# Build and development guide

This guide describes the repository at the checked-out revision. It separates facts read from source from commands tested in this checkout.

## What this project is

Rabby is a TypeScript and React browser extension. Webpack produces several scripts that run in separate browser contexts:

```text
dapp page
  pageProvider.js (page JavaScript context, exposes window.ethereum)
        |
        | BroadcastChannel
        v
  content-script.js (extension content-script context)
        |
        | browser.runtime port
        v
  background.js / MV3 service worker
        |
        +-- controllers, keyrings, storage, RPC and OpenAPI services
        |
        +-- popup.html, notification.html, index.html, desktop.html
              all load the shared ui.js React application
```

The five main Webpack entries are `background`, `content-script`, `pageProvider`, `ui`, and `offscreen`. Webpack also creates the HTML pages and copies static files and the selected extension manifest. See [`build/webpack.common.config.js`](../build/webpack.common.config.js), [`build/paths.js`](../build/paths.js), and the older high-level explanation in [`README.md`](../README.md).

The source tree follows those runtime boundaries:

| Path | Responsibility |
| --- | --- |
| [`src/background`](../src/background) | Privileged extension process: wallet/provider controllers, keyrings, persistence, network services, migrations, and browser APIs |
| [`src/content-script`](../src/content-script) | Injection and message bridge between a dapp page and the background process |
| [`src/ui`](../src/ui) | Shared React application used by the popup, notification, tab, and desktop pages |
| [`src/offscreen`](../src/offscreen) | MV3 offscreen document support, including hardware-wallet bridges |
| [`src/services`](../src/services) | Services shared across extension contexts, including the OpenAPI client lifecycle |
| [`src/db`](../src/db) | IndexedDB schemas and data services |
| [`src/constant`](../src/constant) | Chains, events, feature constants, API defaults, and theme definitions |
| [`src/manifest`](../src/manifest) | Chrome MV3, Chrome MV2, and Firefox MV2 manifests |
| [`_raw`](../_raw) | Files copied unchanged to the output, including icons, fonts, locales, `sw.js`, and vendor scripts |
| [`__tests__`](../__tests__) | Jest tests |
| [`build`](../build) | Webpack, manifest selection, cleaning, packaging, and release code |

## Stack

The version pins live in [`package.json`](../package.json) and [`yarn.lock`](../yarn.lock). The central pieces are:

- Node.js 22 or newer. CI currently selects Node 22.17.1. The repository's [`.nvmrc`](../.nvmrc) says `v22`, while `package.json` accepts `>=22`.
- Yarn 4.14.1 through Corepack. [`.yarnrc.yml`](../.yarnrc.yml) points to the committed `.yarn/releases/yarn-4.14.1.cjs` file and uses a normal `node_modules` install.
- TypeScript 5.3.3 with strict checking, React 18.3.1, React Router 5.3.4, and Webpack 5.76.0.
- Zustand 5.0.14 and TanStack React Query 5.102.2 for newer UI state and request state. Parts of the application still use their existing state patterns, so follow the local module rather than assuming every view uses Zustand.
- Ant Design 4.24.16, styled-components 5.3.5, Less, PostCSS, and Tailwind CSS 4.3.0 for UI styling.
- ethers 5.8.0 and viem 2.47.6, plus EthereumJS and Rabby-owned keyring packages, for chain and signing work.
- Dexie 4.3.0 for IndexedDB data.
- Jest 29.7.0, ts-jest 29.1.1, and jsdom for tests. ESLint 8.57.0 and `tsc` make up the static checks.

The compiler targets ES2020 and resolves imports with bundler semantics. Aliases such as `@/*`, `ui/*`, and `background/*` are defined in [`tsconfig.json`](../tsconfig.json) and mirrored into Webpack and Jest.

Dependency installation runs `patch-package`. Ten checked-in patches under [`patches`](../patches) modify wallet SDKs and build dependencies, so a fork must preserve and periodically revalidate them during upgrades. Yarn also pins a RabbyHub Git dependency for `blake2b` and uses a 15-day minimum package age gate, with Rabby, DeBank, and Warden packages preapproved. See [`.yarnrc.yml`](../.yarnrc.yml).

## Set up a checkout

From the repository root:

```bash
nvm use
corepack enable
yarn install --immutable
```

`corepack enable` makes the `yarn` command use the package manager declared in `package.json`. `--immutable` is the same install policy used by CI and fails if resolution would change the lockfile. The public README says `yarn install`; using `--immutable` is safer when reproducing CI. See [`README.md`](../README.md) and [`.github/workflows/build.yml`](../.github/workflows/build.yml).

Some automation configures an organization-capable npm token before installing packages. If a clean install receives registry authorization errors for an `@rabby-wallet` or `@debank` package, access to the same registry/package scope is required. The CI setup is visible in [`.github/workflows/build.yml`](../.github/workflows/build.yml). Do not put a token in a committed `.npmrc`.

## Build modes and outputs

Use these commands from the repository root:

| Command | Browser/output | Behavior |
| --- | --- | --- |
| `yarn build:dev` | Chrome MV3, `dist/` | Development mode, inline source maps, watches files, debug behavior enabled |
| `yarn dev` | Chrome MV3, `dist/` | Same watched development build with incremental linting and forked TypeScript checking |
| `yarn dev:hot` | Chrome MV3, `dist/` | Starts the custom hot-reload server on port 3173 for the UI bundle |
| `yarn build:turbodev` | Chrome MV3, `dist/` | Watched build with a 24 GiB Node heap limit |
| `yarn build:debug` | Chrome MV3, `dist/` | Production-mode bundle with debug behavior enabled; uses Webpack production defaults for minimization |
| `yarn build:pro` | Chrome MV3, `dist/` | Minified production bundle; removes `console.log`, `console.debug`, and `console.info` |
| `yarn build:dev:mv2` | Firefox MV2, `dist-mv2/` | Watched Firefox MV2 development build |
| `yarn build:debug:mv2` | Firefox MV2, `dist-mv2/` | Firefox MV2 debug build |
| `yarn build:pro:mv2` | Firefox MV2, `dist-mv2/` | Firefox MV2 production build |
| `yarn build:sourcemap` | Default manifest target | Production bundle with hidden source maps and the Sentry Webpack plugin |

These mappings come from [`package.json`](../package.json), [`webpack.config.js`](../webpack.config.js), and the files under [`build`](../build). Every normal build first cleans the selected output and regenerates `src/ui/style/cssvars.css` and `src/ui/style/var-defs.ts` from the theme definitions. Those two files are generated by [`scripts/make-theme.js`](../scripts/make-theme.js).

Development builds watch instead of exiting. For a one-time extension build, use `yarn build:debug` or `yarn build:pro`. Load the resulting unpacked `dist/` directory from the browser's extension development page. Use `dist-mv2/` for the Firefox MV2 build.

Webpack accepts these build-time variables:

| Variable | Use |
| --- | --- |
| `MANIFEST_TYPE` | Selects `chrome-mv3`, `chrome-mv2`, or `firefox-mv2`; package scripts normally set it |
| `VERSION` | Overrides the version embedded in generated code |
| `ETHERSCAN_KEY` | Compiled into the bundle for code paths that read it |
| `RABBY_SENTRY_DSN` | Compiled into the bundle for Sentry initialization |
| `FORK_TS_CHECKER=enable` | Enables transpile-only Webpack compilation plus a separate TypeScript checker |
| `HOT=true` | Enables the custom UI hot-reload path |
| `sourcemap=true` | Enables hidden source maps in a production build |

Anything passed through Webpack's `DefinePlugin` becomes readable in shipped JavaScript. Never pass a private credential this way. See [`build/webpack.common.config.js`](../build/webpack.common.config.js).

### Manifest selection

Chrome production builds copy [`src/manifest/chrome-mv3/manifest.json`](../src/manifest/chrome-mv3/manifest.json). Other Chrome MV3 modes copy `manifest.local.json` when a developer has created it, otherwise they copy [`manifest.dev.json`](../src/manifest/chrome-mv3/manifest.dev.json). MV2 builds always use the target's `manifest.json`. The selection logic is in [`build/manifest-utils.js`](../build/manifest-utils.js).

The main supported targets in scripts are Chrome MV3 and Firefox MV2. A Chrome MV2 manifest remains in the repository, but no top-level package script selects it. Chrome MV3 runs `_raw/sw.js` as the service worker, which imports the generated background bundle. Firefox MV2 uses the persistent generated `background.html` page. Both inject the content script at `document_start` on HTTP, HTTPS, and file pages. Review manifest permissions before publishing a fork because they include broad page access. See [`src/manifest/chrome-mv3/manifest.json`](../src/manifest/chrome-mv3/manifest.json), [`src/manifest/firefox-mv2/manifest.json`](../src/manifest/firefox-mv2/manifest.json), and [`_raw/sw.js`](../_raw/sw.js).

## Checks and tests

Run the normal local checks with:

```bash
yarn check
yarn test
```

`yarn check` runs ESLint over `src` and then `tsc --noEmit --skipLibCheck`. `yarn test` runs Jest. Jest only discovers `*.test.ts` files under `__tests__`, uses jsdom, and transforms TypeScript through ts-jest. At the inspected revision, `__tests__` contains 139 files. See [`package.json`](../package.json) and [`jest.config.js`](../jest.config.js).

The main pull-request workflow installs with `yarn install --immutable` and produces both production and debug MV3 artifacts. It does not run `yarn check` or Jest. A separate flow-check workflow builds production and drives the unpacked extension with `chrome-extension-automator`; the EIP-7702 maintenance workflow runs its focused Node tests and `yarn check` when it changes generated chain data. See [`.github/workflows/build.yml`](../.github/workflows/build.yml), [`.github/workflows/flowcheck.yml`](../.github/workflows/flowcheck.yml), and [`.github/workflows/update-eip7702-supported-chains.yml`](../.github/workflows/update-eip7702-supported-chains.yml).

Before opening a fork PR, a sensible minimum is:

```bash
yarn install --immutable
yarn check
yarn test --runInBand
yarn build:pro
```

The production build matters because it exercises manifest copying, dependency patches, browser polyfills, Warden's build plugin, theme generation, and minification. Unit tests alone do not cover those parts.

## Release tooling

`yarn pub` starts [`build/release.js`](../build/release.js). The script can change package and manifest versions, build MV2 or MV3, process and move source maps, make a zip, and, when its release prompt is accepted, create a commit and push the tag and `master`. Treat it as release automation, not as a local packaging shortcut. `node build/release.js --yes` avoids the prompts and release push, but it still rewrites manifest version files and builds/package outputs.

Production sourcemap upload also expects `SENTRY_ORG`, `SENTRY_PROJECT`, and Sentry CLI access. The internal autobuild additionally expects AWS and Lark secrets and uploads artifacts. These are Rabby release concerns, not prerequisites for an unpacked local fork. See [`scripts/autobuild.sh`](../scripts/autobuild.sh).

## Fork checklist

Branding is spread across code and copied assets. At minimum, audit:

- Extension names, titles, icons, and permissions in [`src/manifest`](../src/manifest).
- The manifest-localized product name in [`_raw/_locales/en/messages.json`](../_raw/_locales/en/messages.json) and every other manifest locale.
- Product copy in [`_raw/locales`](../_raw/locales), including references to Rabby services, fees, support, and policy.
- Icons, logos, and onboarding art in [`_raw/images`](../_raw/images) and [`src/ui/assets`](../src/ui/assets).
- HTML titles under [`src/ui`](../src/ui), constants such as `INTERNAL_REQUEST_SESSION`, analytics, Sentry, uninstall URLs, update checks, store links, feedback, and support links.
- `componentIdPrefix: 'rabby-'`, which is build output naming rather than visible branding and usually does not need changing. It lives in [`build/webpack.common.config.js`](../build/webpack.common.config.js).

Do not assume changing the name and icon makes an independent product. The default API host is `https://api.rabby.io`, defined in [`src/constant/index.ts`](../src/constant/index.ts). The background persists the OpenAPI host and identity, then initializes `@rabby-wallet/rabby-api` with Rabby's web-sign plugin. Production builds force the default Rabby host. See [`src/background/service/openapi.ts`](../src/background/service/openapi.ts), [`src/services/openapi/createOpenapiClient.ts`](../src/services/openapi/createOpenapiClient.ts), and [`src/services/openapi/types.ts`](../src/services/openapi/types.ts).

Portfolio screens rely heavily on that API for balances, token lists, protocols, historical holdings, price curves, address labels, transaction simulation, supported chains, swaps, bridges, and other enriched data. The calls are visible in [`src/ui/utils/portfolio`](../src/ui/utils/portfolio) and the OpenAPI service consumers under `src`. RPC access by itself cannot reproduce all of that indexed and interpreted data. An independent portfolio product therefore needs one of these decisions:

1. Keep Rabby's backend and confirm that your fork is allowed to use its endpoints and terms.
2. Implement a compatible backend and change the OpenAPI host/client contract.
3. Replace each portfolio feature with another data provider and adapt the domain models. This is the largest option because portfolio data also feeds signing and risk views.

Start fork work in narrow slices. A practical first milestone is a rebranded unpacked MV3 build that still uses the existing backend, followed by one isolated feature. Replace backend dependencies only after inventorying the exact OpenAPI methods used by that feature. Wallet code handles secrets and user consent, so preserve the security boundaries between page provider, content script, background, and UI while adding functionality.

## Verification of this guide

The initial inspection below preceded dependency installation. Subsequent installation, static checks, a development build, and browser wallet checks are recorded in the [wallet smoke test](wallet-smoke-test.md). That record also documents the failed production build and the memory limits required on this host.

The following read-only commands were run successfully in this checkout:

```text
node --version                         v24.19.0
corepack --version                     0.35.0
node .yarn/releases/yarn-4.14.1.cjs --version
                                       4.14.1
git --version                          2.54.0
```

The active shell's Node 24 satisfies `package.json`'s `>=22` constraint, although CI uses Node 22.17.1 and that is the better compatibility target. The plain `yarn --version` command failed because Corepack shims were not enabled in this environment. `node_modules/` and `dist/` were absent, so no dependency install, lint, test, or build was run. This review intentionally did not install packages or generate build files.
