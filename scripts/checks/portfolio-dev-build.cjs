const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const loader = require('../../build/portfolio-dev-loader');
const providerPath = require.resolve('@rabby-wallet/page-provider');
const providerSource = fs.readFileSync(providerPath, 'utf8');
const provider = loader.call({ resourcePath: providerPath }, providerSource);
const bridge = loader.call(
  { resourcePath: 'src/content-script/index.ts' },
  fs.readFileSync('src/content-script/index.ts', 'utf8')
);
for (const source of [provider, bridge]) {
  assert.ok(source.includes('rabby-portfolio-dev-content-script'));
  assert.ok(source.includes('rabby-portfolio-dev-page-provider'));
  assert.ok(!source.includes('"rabby-content-script"'));
  assert.ok(!source.includes("'rabby-content-script'"));
}
assert.ok(!provider.includes('window.ethereum'));
assert.ok(!provider.includes('window.web3'));
assert.ok(!provider.includes('window, "rabby"'));
assert.ok(!provider.includes('window, "rabbyWalletRouter"'));
assert.ok(provider.includes('name: "Rabby Portfolio Dev"'));
assert.ok(
  provider.includes('rdns: "io.github.jcarcaboso.rabby.portfolio.dev"')
);
assert.throws(
  () =>
    loader.call(
      { resourcePath: providerPath },
      providerSource.replace('rabby-content-script', 'changed-channel')
    ),
  /namespace changed/
);

process.env.MANIFEST_TYPE = 'chrome-mv3';
const config = require('../../webpack.config')({ config: 'portfolio-dev' });
assert.equal(config.output.path, path.resolve('dist-portfolio-dev'));
assert.equal(config.watch, false);
assert.equal(config.devtool, false);
const copy = config.plugins.find(
  (plugin) => plugin.constructor.name === 'CopyPlugin'
);
const manifestPattern = copy.patterns.find((pattern) =>
  pattern.to.endsWith('/manifest.json')
);
const manifest = JSON.parse(
  manifestPattern.transform(fs.readFileSync(manifestPattern.from))
);
assert.equal(manifest.name, 'Rabby Portfolio Dev');
const extensionId = (key) =>
  [
    ...crypto
      .createHash('sha256')
      .update(Buffer.from(key, 'base64'))
      .digest('hex')
      .slice(0, 32),
  ]
    .map((char) => String.fromCharCode(97 + parseInt(char, 16)))
    .join('');
const original = JSON.parse(
  fs.readFileSync('src/manifest/chrome-mv3/manifest.dev.json')
);
assert.notEqual(extensionId(manifest.key), extensionId(original.key));
assert.deepEqual(manifest.permissions, original.permissions);
assert.deepEqual(manifest.content_scripts, original.content_scripts);
const rawPattern = copy.patterns.find((pattern) =>
  pattern.from.endsWith('/_raw')
);
assert.ok(
  !rawPattern
    .transform(
      Buffer.from('chrome.tabs.update'),
      '/_raw/go-rabby-link-router.js'
    )
    .includes('chrome.tabs.update')
);
for (const file of ['index', 'desktop', 'popup', 'notification']) {
  const plugin = config.plugins.find(
    (plugin) =>
      plugin.constructor.name === 'HtmlWebpackPlugin' &&
      plugin.userOptions.filename === `${file}.html`
  );
  assert.ok(
    plugin.userOptions.templateContent.includes(
      '<title>Rabby Portfolio Dev</title>'
    )
  );
}

console.log(
  `Portfolio dev build checks passed. Extension ID: ${extensionId(
    manifest.key
  )}`
);
