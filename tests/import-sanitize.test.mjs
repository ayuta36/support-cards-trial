/* ============================================================
   tests/import-sanitize.test.mjs ― 取り込みデータの検証(S3)
   ------------------------------------------------------------
   対象:js/data.js の sanitizeImportedTeam と、js/actions.js の processImportFile(取り込みの流れ)。
        危険な ID・色・写真・__proto__ の無害化、件数と長さの上限、v の判定、解錠時には適用しないこと。
   ※取り込みの流れのテストは、アプリの状態を順に使う。テストは登録した順に実行される。
   ============================================================ */
import assert from "node:assert/strict";
import { createApp, test, section, plain, sameData, throwsError, listView } from "./harness.mjs";

const env = createApp();
const { run, get, app, alerts, prompts, startSession, makeShare, importShare } = env;

const sanitize=get("sanitizeImportedTeam");
const cleanTeam={name:"きれいなチーム",emoji:"🏫",color:"#D9707E",people:[
  {id:"p_one",name:"一郎",emoji:"🐻",note:"メモ",photo:"data:image/png;base64,iVBORw0KGgo=",
    topicDefs:[{id:"emergency",icon:"🚨",title:"発作・緊急時",color:"#E05B4B",desc:"まずこれを見てください",urgent:true},{id:"c-1",icon:"📌",title:"独自",color:"#5B8DB8",desc:""}],
    topics:{emergency:[{label:"対応",value:"横向きに寝かせる"}],"c-1":[{label:"a",value:"b"}],orphan_1:[{label:"昔の項目",value:"保持"}]}},
  {id:"p_two",name:"二郎",emoji:"🌸",note:"",photo:null,topicDefs:[],topics:{}},
]};
const safeIdShape=/^[A-Za-z0-9_-]{1,64}$/;
const evilTopics=JSON.parse('{"__proto__":[{"label":"p","value":"p"}],"constructor":[{"label":"c","value":"c"}],"prototype":[{"label":"q","value":"q"}],"toString":[{"label":"t","value":"t"}],"d1":[{"label":"ok","value":"ok"}]}');
const evilTeam={name:"悪意あるチーム",emoji:"🏠",color:"red;background:url(x)",people:[
  {id:'x"><b>',name:"A",emoji:"🌸",note:"n",photo:"javascript:alert(1)",topicDefs:[{id:'bad id"',icon:"📌",title:"t",color:"url(x)",desc:"",urgent:"yes"},{id:"d1",icon:"📌",title:"u",color:"#5B8DB8",desc:""}],topics:evilTopics},
  {id:"ok_id",name:"B",emoji:"🌸",note:"",photo:'data:image/jpeg;base64,AAA" onerror="x',topicDefs:"nope",topics:5},
]};
const protoKeysOf=(obj)=>Object.getOwnPropertyNames(obj).sort().join();
const hostProtoBefore=protoKeysOf(Object.prototype), ctxProtoKeys=()=>get("Object.getOwnPropertyNames(Object.getPrototypeOf({})).sort().join()"), ctxProtoBefore=ctxProtoKeys();
const pollutionRaw=JSON.parse('{"__proto__":{"polluted":"team"},"name":"p","people":[{"__proto__":{"polluted2":"person"},"id":"pp","name":"n","topicDefs":[{"__proto__":{"polluted3":"def"},"id":"dd","title":"t"}],"topics":{"__proto__":{"polluted4":"topics"},"k":[{"__proto__":{"polluted5":"entry"},"label":"l","value":"v"}]}}]}');
const isPolluted=()=>["polluted","polluted2","polluted3","polluted4","polluted5"].some(k=>({})[k]!==undefined||get(`({})[${JSON.stringify(k)}]`)!==undefined);

// 複数のテストにまたがって使う値(最初に使うテストの中で代入する)
let evilOut, photoOf, photoHead, maxPhoto, photoBefore;

section("S3:取り込みデータの検証(sanitizeImportedTeam)");

test("S3:正しいチームは内容を変えずに通す(一覧にないトピックも残す)", async () => {
  assert.ok(sameData(sanitize(cleanTeam),cleanTeam));
});

test("S3:決めた項目以外(未知の項目)は捨てる。チームのidも返さない", async () => {
  const withExtras={...plain(cleanTeam),id:"team_x",secret:"x",people:plain(cleanTeam).people.map(p=>({...p,extra:1,topicDefs:p.topicDefs.map(d=>({...d,extra:2})),topics:Object.fromEntries(Object.entries(p.topics).map(([k,v])=>[k,v.map(e=>({...e,extra:3}))]))}))};
  assert.ok(sameData(sanitize(withExtras),cleanTeam)&&!("id" in sanitize(withExtras)));
});

test("S3:危険なID(x\"><b> など)は、安全なIDに置き換える", async () => {
  evilOut=sanitize(evilTeam);
  assert.ok(safeIdShape.test(evilOut.people[0].id)&&evilOut.people[0].id!=='x"><b>'&&safeIdShape.test(evilOut.people[0].topicDefs[0].id)&&evilOut.people[0].topicDefs[0].id!=='bad id"'&&evilOut.people[1].id==="ok_id");
});

test("S3:不正な色(red;background:url(x) など)は既定の色にする。urgentはtrueのときだけ残す", async () => {
  assert.ok(evilOut.color==="#2F8F83"&&evilOut.people[0].topicDefs[0].color==="#5B8DB8"&&!("urgent" in evilOut.people[0].topicDefs[0])&&evilOut.people[0].topicDefs[1].color==="#5B8DB8");
});

test("S3:不正な写真(javascript:、属性を壊す文字を含むdata URL)はnullにする", async () => {
  assert.ok(evilOut.people[0].photo===null&&evilOut.people[1].photo===null);
});

test("S3:topicsのキー __proto__・constructor・prototype(とObject.prototype由来の名前)は除き、安全なキーだけ残す。プロトタイプも変わらない", async () => {
  assert.ok(sameData(Object.getOwnPropertyNames(evilOut.people[0].topics),["d1"])&&Object.getPrototypeOf(evilOut.people[0].topics)===get("Object.getPrototypeOf({})")&&evilOut.people[0].topics[0]===undefined);
});

test("S3:topicDefsが配列でなければ既定のトピックにし、topicsがオブジェクトでなければ空にする", async () => {
  assert.ok(sameData(evilOut.people[1].topicDefs,get("DEFAULT_TOPICS"))&&Object.keys(evilOut.people[1].topics).length===0);
});

test("S3:__proto__を含む細工データを通しても、Object.prototypeは汚染されず、出力にも影響しない", async () => {
  const pollutionOut=sanitize(pollutionRaw);
  assert.ok(!isPolluted()&&protoKeysOf(Object.prototype)===hostProtoBefore&&ctxProtoKeys()===ctxProtoBefore&&pollutionOut.polluted===undefined&&pollutionOut.people[0].polluted2===undefined&&pollutionOut.people[0].topics.polluted4===undefined&&sameData(pollutionOut,{name:"p",emoji:"🏠",color:"#2F8F83",people:[{id:"pp",name:"n",emoji:"🌸",note:"",photo:null,topicDefs:[{id:"dd",icon:"📌",title:"t",color:"#5B8DB8",desc:""}],topics:{k:[{label:"l",value:"v"}]}}]}));
});

test("S3:人物は200人までに制限し、チーム名は100文字・マークは8文字までにする(絵文字を途中で切らない)", async () => {
  const limitOut=sanitize({name:"あ".repeat(150),emoji:"😀".repeat(12),color:"#12345G",people:Array.from({length:250},(_,i)=>({id:`p${i}`,name:`n${i}`}))});
  assert.ok(limitOut.people.length===200&&limitOut.people[199].id==="p199"&&limitOut.name.length===100&&limitOut.emoji==="😀".repeat(8)&&limitOut.color==="#2F8F83");
});

test("S3:トピック定義は100件、内容は200件までにし、名前100・紹介500・見出し200・内容5000・説明200文字などで切る", async () => {
  const heavyOut=sanitize({name:"x",people:[{id:"h",name:"n".repeat(150),emoji:"🐻".repeat(10),note:"m".repeat(600),photo:null,
    topicDefs:Array.from({length:150},(_,j)=>({id:`t${j}`,icon:"i".repeat(20),title:"T".repeat(150),color:"#123456",desc:"d".repeat(300)})),
    topics:{t0:Array.from({length:300},()=>({label:"l".repeat(300),value:"v".repeat(6000)})),big:"not-array"}}]}).people[0];
  assert.ok(heavyOut.topicDefs.length===100&&heavyOut.name.length===100&&[...heavyOut.emoji].length===8&&heavyOut.note.length===500&&heavyOut.topicDefs[0].icon.length===8&&heavyOut.topicDefs[0].title.length===100&&heavyOut.topicDefs[0].desc.length===200&&heavyOut.topics.t0.length===200&&heavyOut.topics.t0[0].label.length===200&&heavyOut.topics.t0[0].value.length===5000&&!("big" in heavyOut.topics));
});

test("S3:文字列と数値以外は空として扱い、オブジェクトでない要素は捨てる。空の名前や記号は既定値にする", async () => {
  const oddOut=sanitize({name:123,emoji:{a:1},color:5,people:[null,"str",7,[],{id:"a",name:456,emoji:["x"],note:true,photo:12,topicDefs:[1,"x",null,{id:"d",title:{},icon:null}],topics:{a:[null,1,{label:7,value:{}}],b:"x"}}]});
  assert.ok(sameData(oddOut,{name:"123",emoji:"🏠",color:"#2F8F83",people:[{id:"a",name:"456",emoji:"🌸",note:"",photo:null,topicDefs:[{id:"d",icon:"📌",title:"(名前なし)",color:"#5B8DB8",desc:""}],topics:{a:[{label:"7",value:""}]}}]})&&sanitize({people:[]}).name==="受け取ったチーム");
});

test("S3:重複したIDは、先のものを保ち、後のものを新しいIDに振り直す", async () => {
  const dupOut=sanitize({name:"d",people:[{id:"same",name:"1",topicDefs:[{id:"t",title:"a"},{id:"t",title:"b"}],topics:{t:[{label:"x",value:"y"}]}},{id:"same",name:"2"}]});
  assert.ok(dupOut.people[0].id==="same"&&safeIdShape.test(dupOut.people[1].id)&&dupOut.people[1].id!=="same"&&dupOut.people[0].topicDefs[0].id==="t"&&safeIdShape.test(dupOut.people[0].topicDefs[1].id)&&dupOut.people[0].topicDefs[1].id!=="t"&&sameData(dupOut.people[0].topics,{t:[{label:"x",value:"y"}]}));
});

test("S3:写真はjpeg・png・webpのBase64データURL(3,000,000文字以下)だけ残す", async () => {
  photoOf=(photo)=>sanitize({name:"p",people:[{id:"a",name:"n",photo}]}).people[0].photo;
  photoHead="data:image/jpeg;base64,", maxPhoto=photoHead+"A".repeat(3000000-photoHead.length);
  photoBefore=Date.now();
  assert.ok(["data:image/jpeg;base64,/9j/4AAQSkZJRg==","data:image/png;base64,iVBORw0KGgo=","data:image/webp;base64,UklGRg==",maxPhoto].every(v=>photoOf(v)===v));
});

test("S3:それ以外の写真(javascript:、属性を壊す文字、gif/svg/html、本体が空、途中の=、=が3つ、3,000,000文字超、文字列でない値)はnullにする", async () => {
  assert.ok(["javascript:alert(1)",'data:image/jpeg;base64,AAA" onerror="x',"data:image/gif;base64,AAAA","data:image/svg+xml;base64,AAAA","data:text/html;base64,AAAA",photoHead,photoHead+"AA=A",photoHead+"AAAA===",maxPhoto+"A",photoHead+"A".repeat(2999000)+'"',12345,{},["data:image/png;base64,AAAA"]].every(v=>photoOf(v)===null)&&Date.now()-photoBefore<5000);
});

test("S3:オブジェクトでない値や、peopleが配列でないデータは例外にする", async () => {
  assert.ok([null,undefined,[],"文字列",5,true,{},{people:"x"},{people:{}},{people:null}].every(v=>throwsError(()=>sanitize(v))));
});

section("S3:取り込みの流れ(メッセージの区別・v判定・解錠は対象外)");

test("S3:v:2のファイルは、パスコードを聞かずに拒否し、新しいバージョンの案内を出す", async () => {
  await startSession("flow-pass",[],null);
  const v2File=await makeShare("v2-pass",{team:cleanTeam},{v:2});
  const promptsBeforeV2=prompts.length;
  assert.ok(await importShare(v2File,"v2-pass")===0&&prompts.length===promptsBeforeV2&&alerts.at(-1)==="新しいバージョンのアプリで作られたファイルのため、読み込めません。");
});

test("S3:vがないファイルは取り込める", async () => {
  const noVFile=await makeShare("nov-pass",{team:cleanTeam},{v:undefined});
  assert.ok(!("v" in plain(noVFile))&&await importShare(noVFile,"nov-pass")===1);
});

test("S3:復号できても中身の構造が正しくないファイルは、パスコードの誤りとは別のメッセージで拒否する", async () => {
  const alertsBeforeBadShape=alerts.length, badShapes=[{team:{name:"壊れた",people:"配列ではない"}},{team:null},{},{team:[]}];
  let badShapeAdded=0, badShapeMessageOk=true;
  for(const content of badShapes){ badShapeAdded+=await importShare(await makeShare("bad-pass",content),"bad-pass"); badShapeMessageOk=badShapeMessageOk&&alerts.at(-1)==="ファイルの内容が正しくないため、読み込めませんでした。"; }
  assert.ok(badShapeAdded===0&&badShapeMessageOk&&alerts.length===alertsBeforeBadShape+badShapes.length);
});

test("S3:パスコードが違うときは、従来どおり「パスコードがちがうか…」の案内になる", async () => {
  assert.ok(await importShare(await makeShare("right-pass",{team:cleanTeam}),"not-right")===0&&alerts.at(-1)==="パスコードがちがうか、ファイルが壊れています。");
});

test("S3:正しいチームは、取り込みでも内容を変えずに追加される(チームのidだけ新しく振り直す)", async () => {
  const addedClean=await importShare(await makeShare("clean-pass",{team:cleanTeam}),"clean-pass");
  const importedClean=plain(get("teams").at(-1));
  // 取り込んだチームには、アプリが source(取り込んだ印)を付ける。それ以外は内容を変えない
  assert.ok(addedClean===1&&typeof importedClean.id==="string"&&sameData({...importedClean,id:undefined,source:undefined},cleanTeam));
});

test("S3:細工したチームを取り込んでも、危険な値は無害化され、画面のHTMLに入らない", async () => {
  const evilAdded=await importShare(await makeShare("evil-pass",{team:evilTeam}),"evil-pass");
  const evilImported=get("teams").at(-1);
  assert.ok(evilAdded===1&&evilImported.name==="悪意あるチーム"&&evilImported.color==="#2F8F83"&&evilImported.people.length===2&&sameData(Object.getOwnPropertyNames(evilImported.people[0].topics),["d1"])&&!app.innerHTML.includes('x"><b>')&&!app.innerHTML.includes("javascript:")&&!app.innerHTML.includes("onerror"));
});

test("S3:取り込み後のホーム画面にも、細工した色は入らない。Object.prototypeも汚染されていない", async () => {
  run(`stage="home"; ${listView(null)}; render()`);
  assert.ok(!app.innerHTML.includes("url(x)")&&app.innerHTML.includes("悪意あるチーム")&&!app.innerHTML.includes("--accent")&&!isPolluted()&&protoKeysOf(Object.prototype)===hostProtoBefore&&ctxProtoKeys()===ctxProtoBefore);
});

test("S3:端末に保存済みのデータの解錠には検証を適用せず、内容を変えない", async () => {
  const storedLikeTeam={id:"team_raw",name:"保".repeat(150),emoji:"🏠",color:"red",extraTeam:"keep",people:[{id:'weird"id',name:"保存済み",emoji:"🌸",note:"",photo:"not-a-photo",extraPerson:"keep",topicDefs:[{id:"x y",title:"t",icon:"📌",color:"blue"}],topics:{"x y":[{label:"a",value:"b"}]}}]};
  await startSession("raw-pass",[storedLikeTeam]);
  await get("save()"); await get("lockNow()"); await get(`unlock("raw-pass")`);
  assert.ok(get("stage")==="home"&&sameData(get("teams[0]"),storedLikeTeam));
});
