const path = require('path');
const MinifyPlugin = require('babel-minify-webpack-plugin');
const WebExtPlugin = require('../webext-webpack-plugin');

const mode = process.env.NODE_ENV || 'development';

module.exports = {
  mode,
  entry: {
    background: './src/background',
    content_script: './src/content_script',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ['babel-loader', 'eslint-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      '@': path.join(__dirname, 'src'),
    },
  },
  devtool: mode === 'production' ? false : 'source-map',
  plugins: [
    ...(mode === 'production' ? [new MinifyPlugin()] : []),
    new WebExtPlugin({
      overwriteDest: true,
    }),
  ],
};
