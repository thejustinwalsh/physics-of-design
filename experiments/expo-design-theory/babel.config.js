module.exports = (api) => {
  const platform = api.caller((caller) => caller && caller.platform);
  const dev = api.caller((caller) => caller?.isDev ?? process.env.NODE_ENV === 'development');
  return { presets: ['babel-preset-expo', ['react-strict-dom/babel-preset', { platform, dev, debug: dev }]] };
};
