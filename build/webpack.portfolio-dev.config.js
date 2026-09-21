const dev = require('./webpack.dev.config');

module.exports = {
  ...dev,
  watch: false,
  devtool: false,
};
