import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const URL = process.env.TEST_WS_URL || 'ws://localhost:3100/ws';
function client() {
  const ws = new WebSocket(URL);
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  return { ws, messages, waitOpen: () => new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);}), wait(type,timeout=3000){return new Promise((resolve,reject)=>{const started=Date.now();const poll=()=>{const index=messages.findIndex(m=>m.type===type);if(index>=0)return resolve(messages.splice(index,1)[0]);if(Date.now()-started>timeout)return reject(new Error(`Timeout ${type}`));setTimeout(poll,20);};poll();});}, send(type,payload={}){ws.send(JSON.stringify({type,payload,protocol:1}));} };
}

test('two clients create, join and ready a room', async () => {
  const a=client(),b=client();await Promise.all([a.waitOpen(),b.waitOpen()]);
  a.send('CREATE',{nickname:'玩家甲'});const sessionA=await a.wait('SESSION');const code=sessionA.payload.code;assert.match(code,/^\d{6}$/);
  b.send('JOIN',{nickname:'玩家乙',code});const sessionB=await b.wait('SESSION');assert.equal(sessionB.payload.code,code);
  a.send('READY',{ready:true});b.send('READY',{ready:true});
  const state=await a.wait('STATE');assert.equal(state.payload.code,code);
  a.ws.close();b.ws.close();
});
