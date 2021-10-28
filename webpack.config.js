const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const WebExtPlugin = require('@bgpat/webext-webpack-plugin');
const webExtConfig = require('./web-ext-config');

const mode = process.env.NODE_ENV || 'development';

module.exports = {
  mode,
  entry: {
    background: './src/background',
    content_script: './src/content_script',
    options: './src/options',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ['babel-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      '@': path.join(__dirname, 'src'),
    },
  },
  devtool: mode === 'production' ? false : 'inline-source-map',
  plugins: [
    new ESLintPlugin(),
    new WebExtPlugin({
      ...webExtConfig,
      overwriteDest: true,
    }),
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
};
