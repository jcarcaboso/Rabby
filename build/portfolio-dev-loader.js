// The provider package has no configurable namespace. Scope its compiled entry
// at build time; leave node_modules and the normal Rabby build untouched.
// Exact counts deliberately fail the build when a dependency upgrade needs review.
const replace = (source, from, to, count) => {
  if (source.split(from).length - 1 !== count) {
    throw new Error(`Portfolio dev namespace changed: ${from}`);
  }
  return source.split(from).join(to);
};

module.exports = function (source) {
  const isProvider = /[\\/]dist[\\/]index\.js$/.test(this.resourcePath);
  for (const channel of ['content-script', 'page-provider']) {
    source = replace(
      source,
      `rabby-${channel}`,
      `rabby-portfolio-dev-${channel}`,
      1
    );
  }
  if (!isProvider) return source;

  const replacements = [
    ['"Rabby Wallet"', '"Rabby Portfolio Dev"', 1],
    ['"io.rabby"', '"io.github.jcarcaboso.rabby.portfolio.dev"', 2],
    ['window.ethereum', 'window.rabbyPortfolioEthereum', 6],
    ['window.web3', 'window.rabbyPortfolioWeb3', 2],
    ['window.rabby =', 'window.rabbyPortfolio =', 1],
    ['window, "ethereum"', 'window, "rabbyPortfolioEthereum"', 2],
    ['window, "rabby"', 'window, "rabbyPortfolio"', 1],
    ['"rabbyWalletRouter"', '"rabbyPortfolioWalletRouter"', 1],
    ['"ethereum#initialized"', '"rabbyPortfolio#initialized"', 1],
  ];
  for (const [from, to, count] of replacements) {
    source = replace(source, from, to, count);
  }
  return source;
};
