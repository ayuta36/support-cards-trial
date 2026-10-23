import assert from "node:assert/strict";
import { createApp, test, section, makeTestTeam } from "./harness.mjs";

section("複数タブの保存競合");

test("解錠した保存が別タブの更新を上書きせず、保存済み暗号文を保つ", async () => {
  const env=createApp();
  await env.get(`setupNew("conflict-pass")`);
  const original=env.localStorage.getItem("support-card-local-v1");
  const otherSalt=env.get("crypto").getRandomValues(new Uint8Array(16));
  const otherKey=await env.get("deriveKey")("other-pass",otherSalt);
  const otherEnc=await env.get("encryptJson")({teams:[makeTestTeam("other-team")],privateNotes:{private:{text:"keep"}}},otherKey);
  const otherRaw=JSON.stringify({v:1,salt:env.get("b64")(otherSalt),...otherEnc,savedAt:new Date().toISOString()});
  env.localStorage.setItem("support-card-local-v1",otherRaw);
  for(const fn of env.windowHandlers.storage||[]) fn({key:"support-card-local-v1",newValue:otherRaw});
  await env.get("lockNow()"); await env.get(`unlock("other-pass")`);
  assert.equal(env.get("stage"),"home");
  // Reopening with the updated passcode loads the latest snapshot without rewriting it.
  assert.equal(env.localStorage.getItem("support-card-local-v1"),otherRaw);
  assert.equal(env.get("teams[0].id"),"team_test");
  assert.notEqual(original,otherRaw);
});

test("解錠後の外部更新は次の保存を拒み、privateNotesを含む最新暗号文を残す", async () => {
  const env=createApp();
  await env.get(`setupNew("active-pass")`);
  await env.get(`unlock("active-pass")`); // setup ends unlocked; force a fresh baseline from storage
  const salt=env.get("crypto").getRandomValues(new Uint8Array(16));
  const key=await env.get("deriveKey")("changed-pass",salt);
  const enc=await env.get("encryptJson")({teams:[makeTestTeam("newest")],privateNotes:{p:{memo:"private newest"}}},key);
  const latest=JSON.stringify({v:1,salt:env.get("b64")(salt),...enc,savedAt:new Date().toISOString()});
  env.localStorage.setItem("support-card-local-v1",latest);
  env.run(`teams=[${JSON.stringify(makeTestTeam("stale"))}]; privateNotes={p:{memo:"stale"}}`);
  assert.equal(await env.get("save()"),false);
  assert.equal(env.localStorage.getItem("support-card-local-v1"),latest);
  assert.ok(env.alerts.at(-1).includes("別の画面でデータが更新された"));
  assert.equal(env.get("privateNotes.p.memo"),"stale"); // conflict keeps current inputs available
});

test("暗号化中に別タブが保存しても、書込直前の比較で上書きを止める", async () => {
  const env=createApp();
  await env.get(`setupNew("race-pass")`);
  const salt=env.get("crypto").getRandomValues(new Uint8Array(16));
  const key=await env.get("deriveKey")("race-other",salt);
  const enc=await env.get("encryptJson")({teams:[makeTestTeam()],privateNotes:{race:{value:"latest"}}},key);
  const latest=JSON.stringify({v:1,salt:env.get("b64")(salt),...enc,savedAt:new Date().toISOString()});
  env.context.__realEncrypt=env.get("encryptJson");
  env.context.__latestRaw=latest;
  env.run(`encryptJson=async(...args)=>{ const out=await globalThis.__realEncrypt(...args); localStorage.setItem("support-card-local-v1",globalThis.__latestRaw); return out; }`);
  assert.equal(await env.get("save()"),false);
  assert.equal(env.localStorage.getItem("support-card-local-v1"),latest);
  assert.ok(env.alerts.at(-1).includes("別の画面でデータが更新された"));
});

test("遅れて届いたstorage eventは現在値がbaselineと一致すれば誤検知しない", async () => {
  const env=createApp();
  await env.get(`setupNew("delayed-event-pass")`);
  const raw=env.localStorage.getItem("support-card-local-v1");
  for(const fn of env.windowHandlers.storage||[]) fn({key:"support-card-local-v1",newValue:"older event value"});
  assert.equal(env.get("externalStoreChanged"),false);
  assert.equal(await env.get("save()"),true);
  assert.notEqual(env.localStorage.getItem("support-card-local-v1"),raw);
});

test("Web Locksは同時保存を直列化し、後続タブの古いbaselineを拒否する", async () => {
  const first=createApp();
  await first.get(`setupNew("shared-pass")`);
  const initial=first.localStorage.getItem("support-card-local-v1");
  const second=createApp({storage:{"support-card-local-v1":initial}});
  await second.get(`unlock("shared-pass")`);
  const shared=new Map([["support-card-local-v1",initial]]);
  for(const env of [first,second]){
    env.localStorage.getItem=(k)=>shared.has(k)?shared.get(k):null;
    env.localStorage.setItem=(k,v)=>shared.set(k,String(v));
  }
  let tail=Promise.resolve();
  const locks={request(_name,callback){const result=tail.then(callback); tail=result.catch(()=>{}); return result;}};
  first.navigatorStub.locks=locks; second.navigatorStub.locks=locks;
  first.run(`teams[0].name="first tab"`);
  second.run(`teams[0].name="second tab"`);
  const results=await Promise.all([first.get("save()"),second.get("save()")]);
  assert.equal(results.filter(Boolean).length,1);
  const saved=shared.get("support-card-local-v1");
  assert.notEqual(saved,initial);
  assert.equal(results[0] ? second.alerts.at(-1).includes("別の画面") : first.alerts.at(-1).includes("別の画面"),true);
});

test("誤パスコードはstorage event後でも失敗回数制限を維持する", async () => {
  const env=createApp();
  await env.get(`setupNew("lockout-pass")`);
  await env.get("lockNow()");
  const changed=JSON.stringify({v:1,salt:"other-tab"});
  env.localStorage.setItem("support-card-local-v1",changed);
  for(const fn of env.windowHandlers.storage||[]) fn({key:"support-card-local-v1",newValue:changed});
  await env.get(`unlock("wrong-pass")`);
  assert.equal(env.get("loadMeta().fails"),1);
  assert.ok(env.app.innerHTML.includes("パスコードがちがいます"));
});

test("解錠中に保存rawが変わったら誤パスコード扱いにせず再試行を案内する", async () => {
  const env=createApp();
  await env.get(`setupNew("unlock-race-pass")`);
  await env.get("lockNow()");
  const latest=JSON.stringify({v:1,salt:"updated-during-unlock"});
  env.context.__realDecrypt=env.get("decryptJson");
  env.context.__latestRaw=latest;
  env.run(`decryptJson=async(...args)=>{ const out=await globalThis.__realDecrypt(...args); localStorage.setItem("support-card-local-v1",globalThis.__latestRaw); return out; }`);
  await env.get(`unlock("unlock-race-pass")`);
  assert.equal(env.get("loadMeta().fails"),0);
  assert.equal(env.get("stage"),"locked");
  assert.ok(env.app.innerHTML.includes("別の画面で保存データが更新されました"));
});

test("storage通知は編集を消さず、次の保存で競合を知らせる", async () => {
  const env=createApp();
  await env.get(`setupNew("notice-pass")`);
  const next=JSON.stringify({v:1,salt:"updated"});
  env.localStorage.setItem("support-card-local-v1",next);
  for(const fn of env.windowHandlers.storage||[]) fn({key:"support-card-local-v1",newValue:next});
  assert.equal(env.get("stage"),"home");
  assert.equal(await env.get("save()"),false);
  assert.ok(env.alerts.at(-1).includes("別の画面でデータが更新された"));
  assert.equal(env.get("stage"),"home");
});

test("通常の保存容量エラーは競合案内と区別される", async () => {
  const env=createApp();
  await env.get(`setupNew("quota-pass")`);
  env.failStoreWrites=true;
  assert.equal(await env.get("save()"),false);
  assert.ok(env.alerts.at(-1).includes("写真が多すぎる場合"));
  assert.ok(!env.alerts.at(-1).includes("別の画面"));
});
