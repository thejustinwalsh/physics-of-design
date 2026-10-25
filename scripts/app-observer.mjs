import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'artifacts/fieldwork/native-observations';
await mkdir(directory, { recursive: true });
const token = process.env.DESIGN_NATIVE_TOKEN;
if (!token) throw new Error('DESIGN_NATIVE_TOKEN is required');
let sequence = 0;
createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.writeHead(401);
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url !== '/observations') {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error('Observation exceeds limit');
      chunks.push(chunk);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (
      payload.engine !== 'react-native/Text+Yoga' ||
      !['ios', 'android'].includes(payload.platform)
    )
      throw new Error('Invalid native identity');
    const name = `${payload.platform}-${payload.snapshot.plan.navigation}-${payload.snapshot.screen}`;
    await writeFile(
      `${directory}/${String(++sequence).padStart(4, '0')}-${name}.json`,
      JSON.stringify(payload, null, 2) + '\n',
    );
    const proofId = String(payload.snapshot.proofId ?? '');
    if (proofId)
      await writeFile(
        `${directory}/request-${createHash('sha256').update(proofId).digest('hex')}.json`,
        JSON.stringify(payload, null, 2) + '\n',
      );
    await writeFile(
      `${directory}/latest-${payload.platform}.json`,
      JSON.stringify(payload, null, 2) + '\n',
    );
    res.writeHead(201);
    res.end('{}');
  } catch (error) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: String(error) }));
  }
}).listen(4321, '127.0.0.1', () =>
  console.log('Fieldwork native observer ready at 127.0.0.1:4321'),
);
