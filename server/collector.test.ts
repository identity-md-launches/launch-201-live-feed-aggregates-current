import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
test('collector publishes filtered live JSON atomically and preserves it on upstream failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'imd-collector-test-'));
  try {
    const config=join(dir,'sources.json'),out=join(dir,'feed.json'),state=join(dir,'state.json'),mock=join(dir,'mock.mjs');
    await writeFile(config,JSON.stringify([{id:'Bluesky',kind:'bluesky',enabled:true}]));
    const post={uri:'at://did:plc:test/app.bsky.feed.post/1',author:{handle:'builder.test'},record:{createdAt:new Date().toISOString(),text:'Identity-MD contributors are documenting the network, testing useful tools, sharing their findings, and building small applications for the broader community.'}};
    await writeFile(mock,`globalThis.fetch=async()=>new Response(${JSON.stringify(JSON.stringify({posts:[post,{...post,uri:'at://did:plc:test/app.bsky.feed.post/2',record:{...post.record,text:'$IMD'}}]}))},{status:200});`);
    const args=['--import','tsx','--import',mock,resolve('server/collect.ts'),'--config',config,'--out',out,'--state',state,'--force'];
    await run(process.execPath,args);
    const first=JSON.parse(await readFile(out,'utf8'));assert.equal(first.mode,'live');assert.equal(first.entries.length,1);assert.equal(first.health[0].ok,true);
    await writeFile(mock,'globalThis.fetch=async()=>new Response("Unavailable",{status:503});');
    await run(process.execPath,args);
    const second=JSON.parse(await readFile(out,'utf8'));assert.deepEqual(second.entries,first.entries);assert.equal(second.lastSuccessAt,first.lastSuccessAt);assert.equal(second.health[0].ok,false);
    const noOutput=join(dir,'preview.json');await writeFile(noOutput,await readFile('public/feed.json'));
    const previewBefore=await readFile(noOutput,'utf8');const failedArgs=[...args];failedArgs[failedArgs.indexOf('--out')+1]=noOutput;
    await assert.rejects(run(process.execPath,failedArgs));assert.equal(await readFile(noOutput,'utf8'),previewBefore);
  } finally { await rm(dir,{recursive:true}); }
});
