import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sourceIdentity } from './source-identity.mjs';
const project = fileURLToPath(new URL('..', import.meta.url)), root = path.resolve(project, '../..');
const output = path.join(root, 'artifacts/expo-design-theory');
await mkdir(output, { recursive: true });
const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', __UNSAFE_EXPO_HOME_DIRECTORY: path.join(root, 'artifacts/expo-home'), EXPO_PUBLIC_DESIGN_SOURCE_HASH: await sourceIdentity(), EXPO_PUBLIC_DESIGN_OBSERVER: 'http://127.0.0.1:4333/observe' };
const observer = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/observe') { res.writeHead(404).end(); return; }
  let bytes = 0, body = '';
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 1000000) { res.writeHead(413).end(); return; } body += chunk; }
  try {
    const value = JSON.parse(body);
    if (!['native-ios', 'native-android'].includes(value.platform)) throw Error('platform');
    await writeFile(path.join(output, `${value.platform}-latest.json`), JSON.stringify({ deliveredAt: new Date().toISOString(), ...value }, null, 2));
    res.writeHead(204).end();
  } catch { res.writeHead(400).end(); }
});
await new Promise((resolve) => observer.listen(4333, '127.0.0.1', resolve));
const handles = [], children = [];
for (const [name, command, args, cwd, extra] of [
  ['metro', 'npm', ['run', 'start', '--', '--clear', '--port', '8097'], project, {}],
  ['proxy', process.execPath, ['scripts/metro-proxy.mjs'], root, { DESIGN_METRO_PROXY_PORT: '8098', DESIGN_METRO_UPSTREAM_PORT: '8097' }],
]) {
  const log = await open(path.join(output, `${name}.log`), 'a'); handles.push(log);
  const child = spawn(command, args, { cwd, env: { ...env, ...extra }, stdio: ['ignore', log.fd, log.fd] }); children.push(child);
}
await writeFile(path.join(output, 'session.json'), JSON.stringify({ sourceIdentity: env.EXPO_PUBLIC_DESIGN_SOURCE_HASH, pid: process.pid, metro: 8097, proxy: 8098, observer: 4333, children: children.map((c) => c.pid) }, null, 2));
console.log('Expo spike session: Metro8097/proxy8098/observer4333');
async function stop() { for (const child of children) child.kill('SIGTERM'); observer.close(); for (const handle of handles) await handle.close(); process.exit(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
