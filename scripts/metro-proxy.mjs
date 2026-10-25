import net from 'node:net';
const port = Number(process.env.DESIGN_METRO_PROXY_PORT ?? 8088),
  upstreamPort = Number(process.env.DESIGN_METRO_UPSTREAM_PORT ?? 8087);
for (const value of [port, upstreamPort])
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    throw new Error('Invalid local Metro port');
const server = net.createServer((client) => {
  const upstream = net.connect({ host: '::1', port: upstreamPort });
  client.pipe(upstream).pipe(client);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      ready: true,
      url: `http://127.0.0.1:${port}`,
      upstream: `http://[::1]:${upstreamPort}`,
    }),
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
