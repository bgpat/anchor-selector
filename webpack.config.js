const path = require('path');
const MinifyPlugin = require('babel-minify-webpack-plugin');

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
        use: [
          'babel-loader',
          'eslint-loader',
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  devtool: mode === 'production' ? false : 'source-map',
  plugins: mode === 'production' ? [new MinifyPlugin()] : [],
};
