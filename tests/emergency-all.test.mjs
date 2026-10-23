/* ============================================================
   tests/emergency-all.test.mjs ― ホームの「緊急時の情報（すべてのチーム）」と、「記入なし」「公開されていません」の区別
   ------------------------------------------------------------
   対象:js/views.js の homeScreen(ボタン)・emergencyAllScreen・emergencyCard、js/data.js の emergencyAudience・emergencyInfo(hidden)、
        js/state.js の emergencyTeams・currentScreen・navDepth、js/actions.js の open-emergency-all・back-home・navBack・popstate・
        EMERGENCY_ALL_ALLOWED(handle() の二重の防御)、css/style.css の新しい部品。
   困りごと:運営の端末では、家族ごとに別のチームで情報を受け取る。チームごとの「緊急時の情報（全員分）」は、そのチームの人の分しか出さないので、
        運営が全参加者の緊急情報を1画面で見られなかった。データは複製せず、閲覧専用のまま、ホームから全チーム分を見られるようにする。
   仕様:・ホームの操作の先頭に、緊急時の情報のボタン(題名「緊急時の情報」、補足「すべてのチームの情報を確認」。押すと、題名が「緊急時の情報（すべてのチーム）」の一覧を開く)。
          運営に見せてよい内容を含みうるチームが1つ以上あるときだけ。
          =自分のチーム、または source.audience が all か staff の受け取ったチーム。学生向けで受け取ったチームしかなければ出さない。
        ・画面:上部に既存の注記。チームごとに見出し(チーム名だけ。チームのマークと色は使わない。受け取ったチームは「受け取った情報」と作成日)、その下に人物ごとのカード(emergencyCard)。
          使う相手は、自分のチームなら all、受け取ったチームなら source.audience。学生向けで受け取ったチームは含めない。
        ・見るだけ。tel: のリンクも編集の操作もなく、使える操作は「← ホーム」(back-home)だけ。handle() でも、戻る・閉じる・ロック以外は受け付けない。
        ・戻る操作:ホームを深さ0として、この画面は深さ1。「← ホーム」と端末の「戻る」でホームへ。ロック中は何もしない。
        ・空のところ:トピックがない・中身が空 →「記入なし（家族に確認してください）」/
          トピックはあるが、その相手に見せない設定 →「運営スタッフには公開されていません（家族に確認してください）」(チームごとの一覧も同じ)。
   ※セクションの中では、前のテストの結果(端末の状態)を後のテストが使うことがあるため、順番を変えない。テストは登録した順に実行される。
     このファイルだけの新しいアプリ(createApp)で動く。
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createApp, test, section, plain, installHistory, ROOT } from "./harness.mjs";

const env = createApp();
const { run, get, app, context, startSession, makeShare, importShare, windowHandlers, alerts, confirms, prompts, localStorage } = env;

const defs = plain(get("DEFAULT_TOPICS"));
const fmtDay = get("fmtDay");
const PASS = "emergency-all-pass";
const STORE = "support-card-local-v1";
const CREATED = "2026-10-18T03:00:00.000Z";
const BUTTON = "緊急時の情報（すべてのチーム）";   // 一覧の画面の題名(絵文字は付かない)
const HOME_BUTTON = { title: "緊急時の情報", desc: "すべてのチームの情報を確認" };   // ホームのボタンの文言(題名と補足。class は home-emergency)
const ALERT24 = get(`icon("alert",24)`);   // ホームのボタンの前に付く、線の緊急のアイコン
const NOTE = "この一覧は、運営スタッフが状況を共有するためのものです。医療的な判断は、付き添いの方と医療者が行います。";
const BLANK = "記入なし（家族に確認してください）";
const HIDDEN = "運営スタッフには公開されていません（家族に確認してください）";
const SCREEN_ACTS = ["back-home"];   // この画面に出してよい操作
const NOT_ON_SCREEN = ["edit-person", "add-person", "toggle-organize", "add-topic", "open-copyto", "start-edit", "edit-team", "set-audience", "make-editable", "speak-topic", "speak", "print", "open-emergency", "open-person", "enter-team", "share-team", "import", "settings", "del-team"];

// ---- 道具 ----
const person = (id, name, topics = {}, extra = {}) => ({ id, name, emoji: "🌸", note: "", photo: null, topicDefs: defs.map((d) => ({ ...d })), topics, ...extra });
const team = (id, name, emoji, people) => ({ id, name, emoji, color: "#2F8F83", people });
// 自分のチーム:1人目は緊急も連絡先もある(運営に見せない設定でも、家族の分としてそのまま出ることを確かめるため、緊急は学生だけの設定にしてある)。2人目は何も書いていない
const ownTeam = (id = "team_own", name = "テーブルA") => {
  const t = team(id, name, "🏠", [
    person("p_hana", "はなさん", {
      emergency: [{ label: "発作のサイン", value: "目が右上を向きます" }, { label: "まずしてほしいこと", value: "付き添いの方に伝えてください" }],
      basic: [{ label: "名前", value: "山田 はな" }, { label: "緊急連絡先", value: "母: 000-0000-0000" }],
      communication: [{ label: "伝え方", value: "目を閉じると「はい」" }],
    }),
    person("p_sora", "そらさん"),
  ]);
  t.people[0].topicDefs.find((d) => d.id === "emergency").audience = ["student"];
  return t;
};
// 受け取る側のチーム(1人)。tag で内容を変える(チームごとの内容が混ざっていないことを確かめるため)
const familyTeam = (id, name, tag) => team(id, name, "🎪", [
  person(`${id}_p`, `${tag}さん`, { emergency: [{ label: "サイン", value: `${tag}のサイン` }], basic: [{ label: "連絡先", value: `${tag}の連絡先 000` }, { label: "年齢", value: `${tag}の年齢` }] }),
]);
const receive = async (t, audience, createdAt = CREATED) => {
  const file = await makeShare(PASS, { team: t, meta: { audience, createdAt, appVersion: "x" } });
  assert.strictEqual(await importShare(file, PASS), 1);
};
const HOME = `stage="home"; view={teamId:null,screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}; modal=null; modalDraft=null; render()`;
const toHome = () => run(HOME);
const open = async () => { toHome(); await get(`handle("open-emergency-all",{})`); };
const names = () => plain(get("emergencyTeams().map(x=>x.team.name)"));
const dataActs = (html) => [...new Set([...html.matchAll(/data-act="([a-z-]+)"/g)].map((m) => m[1]))];
const count = (text, part) => text.split(part).length - 1;
// チームの見出し(h2)から次のチームまでを取り出す。人物のカード(名前の見出し h3)を取り出す
const teamOf = (html, name) => { const chunk = html.split('<section class="em-team"').find((c) => c.includes(`>${name}</h2>`)); assert.ok(chunk, `チーム「${name}」の見出しがない`); return chunk; };
const cardOf = (html, name) => { const i = html.indexOf(`>${name}</h3>`); assert.ok(i >= 0, `「${name}」の見出しがない`); return html.slice(html.lastIndexOf('<section class="em-person"', i), html.indexOf("</section>", i)); };
// いまの状態(チーム・保存データ・画面・小窓・下書き・表示設定・確認の回数)。操作の前後で変わっていないことを確かめるのに使う
const stateOf = () => JSON.stringify({ teams: get("teams"), store: localStorage.getItem(STORE), stage: get("stage"), view: get("view"), modal: get("modal"), modalDraft: get("modalDraft"), draft: get("draft"), prefs: get("prefs"), confirms: confirms.length, alerts: alerts.length, prompts: prompts.length });

section("ホームのボタンを出す条件");

test("自分のチームがあれば、ホームの操作の先頭に「緊急時の情報」(すべてのチームの情報を確認)のボタンが出て、押すと全チームの一覧を開く(チームの中のボタンとは別)", async () => {
  await startSession("ea-btn-own", [ownTeam()], null);
  toHome();
  const html = app.innerHTML;
  assert.ok(html.includes(`<button class="home-emergency" data-act="open-emergency-all">${ALERT24}<span class="home-action-body"><span class="home-action-title">${HOME_BUTTON.title}</span><span class="home-action-desc">${HOME_BUTTON.desc}</span></span>`));
  const acts = [...html.matchAll(/data-act="([a-z-]+)"/g)].map((m) => m[1]);   // 画面に出る順(重複を除かない)
  assert.strictEqual(acts[0], "open-emergency-all");   // ホームの操作の先頭(新しいチーム・共有ファイルの読み込み・チーム・設定より前)
  assert.deepStrictEqual(acts.slice(0, 3), ["open-emergency-all", "open-team-create", "import"]);
  assert.ok(html.indexOf("open-emergency-all") < html.indexOf('data-act="settings"'));
  assert.ok(!html.includes('data-act="open-emergency"'));   // 「緊急時の情報（全員分）」(チームごと)は、チームの中のボタン
  assert.strictEqual(get("emergencyTeams().length"), 1);
  await get(`handle("open-emergency-all",{})`);   // ボタンの操作(data-act)を押すと、全チームの一覧を開く
  assert.ok(get("currentScreen()") === "emergency-all" && app.innerHTML.includes(`<h1 class="list-title em-all-title">${BUTTON}</h1>`));
  toHome();
});

test("チームが0のときは出ない。handle() を直接呼んでも開かない", async () => {
  await startSession("ea-btn-zero", [], null);
  toHome();
  assert.ok(!app.innerHTML.includes("open-emergency-all") && !app.innerHTML.includes(ALERT24) && get("emergencyTeams().length") === 0);
  await get(`handle("open-emergency-all",{})`);
  assert.ok(get("view.screen") === "list" && get("currentScreen()") === "home" && get("navDepth()") === 0 && !app.innerHTML.includes("em-team"));
});

test("受け取ったチームだけの端末:学生向けなら出ない。運営向け・すべてなら出る(端末ごとに確かめる)", async () => {
  const shown = {}, counts = {};
  for (const audience of ["student", "staff", "all"]) {
    await startSession(`ea-btn-${audience}`, [], null);
    await receive(familyTeam("team_src", "やまだ家", "みどり"), audience);
    toHome();
    shown[audience] = app.innerHTML.includes('data-act="open-emergency-all"');
    counts[audience] = get("emergencyTeams().length");
  }
  assert.deepStrictEqual(shown, { student: false, staff: true, all: true });
  assert.deepStrictEqual(counts, { student: 0, staff: 1, all: 1 });
});

test("学生向けで受け取ったチームしかないときは、handle() を直接呼んでも開かない(学生に見せる端末などに、運営向けの画面を出さない)", async () => {
  await startSession("ea-btn-student", [], null);
  await receive(familyTeam("team_src", "やまだ家", "みどり"), "student");
  toHome();
  const before = stateOf();
  await get(`handle("open-emergency-all",{})`);
  assert.strictEqual(stateOf(), before);
  assert.ok(get("view.screen") === "list" && get("currentScreen()") === "home" && !app.innerHTML.includes("em-team"));
  run(`view.screen="emergency-all"; render()`);   // 画面の状態だけを一覧にしても、出せるチームがなければ、ホームを描く
  assert.ok(get("currentScreen()") === "home" && get("navDepth()") === 0 && !app.innerHTML.includes("em-team") && app.innerHTML.includes("ホーム"));
});

test("学生向けで受け取ったチームがあっても、ほかに自分のチームか、運営向け・すべてで受け取ったチームがあれば出る(出るのはそのチームの分だけ)", async () => {
  await startSession("ea-btn-mix", [ownTeam()], null);
  await receive(familyTeam("team_stu", "学生向けの家", "あお"), "student");
  toHome();
  assert.ok(app.innerHTML.includes('data-act="open-emergency-all"'));   // 自分のチームがある
  assert.deepStrictEqual(names(), ["テーブルA"]);
  await startSession("ea-btn-mix2", [], null);
  await receive(familyTeam("team_stu", "学生向けの家", "あお"), "student");
  toHome(); assert.ok(!app.innerHTML.includes("open-emergency-all"));
  await receive(familyTeam("team_stf", "運営向けの家", "みどり"), "staff");
  toHome(); assert.ok(app.innerHTML.includes('data-act="open-emergency-all"'));
  assert.deepStrictEqual(names(), ["運営向けの家"]);
});

section("一覧の内容(チームの見出し・チームごとの相手・学生向けを除く)");

// 以降のテストは、この端末の状態(自分のチーム1つ、運営向け・すべて・学生向けで受け取ったチーム、人物のいない自分のチーム)を使う
test("開くと、全チームの一覧になる(stage は home のまま、深さは1)。上部に既存の注記と「← ホーム」がある", async () => {
  await startSession("ea-list", [ownTeam(), team("team_empty", "空のチーム", "🌈", [])], null);
  await receive(familyTeam("team_stf", "やまだ家", "みどり"), "staff");
  await receive(familyTeam("team_all", "控えの家", "きいろ"), "all", null);   // 作成日時のない古い形
  await receive(familyTeam("team_stu", "学生向けの家", "あお"), "student");
  toHome();
  await get(`handle("open-emergency-all",{})`);
  const html = app.innerHTML;
  assert.deepStrictEqual(plain([get("stage"), get("view.screen"), get("view.teamId"), get("currentScreen()"), get("navDepth()")]), ["home", "emergency-all", null, "emergency-all", 1]);
  assert.ok(html.includes(`<h1 class="list-title em-all-title">${BUTTON}</h1>`) && html.includes(`<p class="em-note" role="note">${NOTE}</p>`));
  assert.ok(html.indexOf("em-note") < html.indexOf("em-team"));   // 注記は画面の上部
  assert.ok(html.includes('<button class="back-link" data-act="back-home">← ホーム</button>'));
});

test("チームごとに見出しが付き、ホームのチーム一覧と同じ順に並ぶ。受け取ったチームには「受け取った情報」と作成日が付き、自分のチームには付かない。チームのマーク(絵文字)は出さない", async () => {
  const html = app.innerHTML;
  const heads = [...html.matchAll(/class="em-team-name" id="em-team-\d+">([^<]*)</g)].map((m) => m[1]);
  assert.deepStrictEqual(heads, ["テーブルA", "空のチーム", "やまだ家", "控えの家"]);   // teams の順(学生向けの家は含まない)。チーム名だけ(保存データのマーク 🏠・🌈・🎪 は表示に使わない)
  assert.deepStrictEqual(plain(get("teams.map(t=>t.name)")), ["テーブルA", "空のチーム", "やまだ家", "控えの家", "学生向けの家"]);   // ホームの順
  const subs = [...html.matchAll(/class="em-team-sub">([^<]*)</g)].map((m) => m[1]);
  assert.deepStrictEqual(subs, [`受け取った情報 ・ 作成: ${fmtDay(CREATED)}`, "受け取った情報 ・ 作成: 不明"]);   // 作成日時のないファイルは「不明」
  assert.ok(!teamOf(html, "テーブルA").includes("受け取った情報") && !teamOf(html, "空のチーム").includes("受け取った情報"));
  assert.ok(count(html, "受け取った情報") === 2);
  assert.ok(!/🏠|🌈|🎪/u.test(html));
});

test("チームごとに使う相手が違う:自分のチームは「すべて」(運営に見せない設定の緊急情報も、家族の分としてそのまま出る)。運営向け・すべてで受け取ったチームは、その相手", async () => {
  const html = app.innerHTML;
  const own = teamOf(html, "テーブルA"), stf = teamOf(html, "やまだ家"), all = teamOf(html, "控えの家");
  assert.ok(own.includes("目が右上を向きます") && own.includes("母: 000-0000-0000"));   // 緊急は学生だけの設定でも、自分のチームには出る
  assert.deepStrictEqual(plain(get("emergencyTeams().map(x=>x.audience)")), ["all", "all", "staff", "all"]);
  assert.ok(stf.includes("みどりのサイン") && stf.includes("みどりの連絡先 000"));
  assert.ok(all.includes("きいろのサイン") && all.includes("きいろの連絡先 000"));
  // チームの内容が、ほかのチームに混ざらない
  for (const text of ["みどりのサイン", "きいろのサイン"]) assert.ok(!own.includes(text));
  for (const text of ["目が右上を向きます", "きいろのサイン"]) assert.ok(!stf.includes(text));
  for (const text of ["目が右上を向きます", "みどりのサイン"]) assert.ok(!all.includes(text));
});

test("学生向けで受け取ったチームは、一覧に含まれない(チーム名も、人物も、内容も出ない)", async () => {
  const html = app.innerHTML;
  for (const text of ["学生向けの家", "あおさん", "あおのサイン", "あおの連絡先"]) assert.ok(!html.includes(text), text);
  assert.ok(!names().includes("学生向けの家") && get("teams.some(t=>t.name==='学生向けの家')"));   // チーム自体はホームにある(一覧に出さないだけ)
});

test("人物のカードは、チームごとの一覧と同じ内容:緊急の全項目と、見出しに「連絡」を含む基本情報だけ。書いていない人には「記入なし」。人物のいないチームには案内が出る", async () => {
  const html = app.innerHTML;
  const hana = cardOf(html, "はなさん");
  for (const text of ["発作のサイン", "目が右上を向きます", "まずしてほしいこと", "付き添いの方に伝えてください", "緊急連絡先", "母: 000-0000-0000"]) assert.ok(hana.includes(text), text);
  for (const text of ["山田 はな", "伝え方", "目を閉じると"]) assert.ok(!hana.includes(text), text);   // 基本情報のそれ以外・ほかのトピックは出ない
  assert.ok(hana.includes("発作・緊急時") && hana.includes("連絡先") && !hana.includes("em-empty"));
  const sora = cardOf(html, "そらさん");
  assert.ok(sora.includes(`<p class="em-empty">${BLANK}</p>`) && count(sora, "em-empty") === 1 && !sora.includes("em-sec"));
  const midori = cardOf(html, "みどりさん");
  assert.ok(midori.includes("みどりの連絡先 000") && !midori.includes("みどりの年齢"));
  assert.ok(teamOf(html, "空のチーム").includes("このチームには、カードが含まれていません。") && !teamOf(html, "空のチーム").includes("em-person"));
});

test("見出しの段が飛ばない(題名 h1 → チーム h2 → 人物 h3 → 項目 h4)。id は重ならず、aria-labelledby は実在する id を指す(同じ名前の人が別のチームにいても)", async () => {
  await startSession("ea-ids", [team("t1", "チーム1", "🏠", [person("a", "同じ名前", { emergency: [{ label: "a", value: "a" }] })]), team("t2", "チーム2", "🏠", [person("a", "同じ名前", { emergency: [{ label: "b", value: "b" }] })])], null);
  await open();
  const html = app.innerHTML;
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  assert.strictEqual(levels[0], 1);
  assert.ok(levels.every((l, i) => i === 0 || l <= levels[i - 1] + 1), `見出しの段:${levels}`);
  assert.deepStrictEqual([...new Set(levels)].sort(), [1, 2, 3, 4]);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(ids.length === 4 && [...html.matchAll(/aria-labelledby="([^"]+)"/g)].every((m) => ids.includes(m[1])));
  assert.strictEqual(count(html, ">同じ名前</h3>"), 2);
});

test("チーム名・人物名・内容は HTML として解釈されない(エスケープ)", async () => {
  const evil = '<img src=x onerror=alert(1)>';
  await startSession("ea-esc", [team("t1", evil, "🏠", [person("a", `"><script>alert(2)</script>`, { emergency: [{ label: evil, value: `<b>${evil}</b>` }] })])], null);
  await open();
  const html = app.innerHTML;
  assert.ok(!html.includes("<img src=x") && !html.includes("<script") && !html.includes("<b>"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;") && html.includes("&quot;&gt;&lt;script&gt;"));
});

section("「記入なし」と「公開されていません」の区別");

// 運営向けで受け取ったチーム(ファイルの中に、運営に見せない設定のトピックが残っている形)。人物ごとに、空の理由を変えてある
const patterns = () => {
  const hide = (p, ...ids) => { for (const id of ids) p.topicDefs.find((d) => d.id === id).audience = ["student"]; return p; };
  const entries = { emergency: [{ label: "サイン", value: "表示される緊急" }], basic: [{ label: "緊急連絡先", value: "表示される連絡先" }] };
  return team("team_pat", "区別の家", "🎪", [
    person("q_none", "何もない人"),                                                                         // トピックはあるが中身が空 → 記入なし
    person("q_nodef", "定義のない人", {}, { topicDefs: defs.filter((d) => !["emergency", "basic"].includes(d.id)) }),   // トピック自体がない → 記入なし
    hide(person("q_both", "両方見せない人", entries), "emergency", "basic"),                                   // どちらもあるが見せない設定 → 公開されていません
    hide(person("q_em", "緊急だけ見せない人", { ...entries, basic: [{ label: "名前", value: "連絡ではない" }] }), "emergency"),   // 緊急は見せない、連絡先の欄は記入なし
    hide(person("q_ct", "連絡先だけ見せない人", entries), "basic"),                                           // 緊急は出る、連絡先は見せない
  ]);
};

test("全チームの一覧:トピックがない・中身が空 →「記入なし」。トピックはあるが見せない設定 →「公開されていません」。どちらも「家族に確認してください」", async () => {
  await startSession("ea-pat", [], null);
  await receive(patterns(), "staff");
  await open();
  const html = app.innerHTML;
  const none = cardOf(html, "何もない人"), nodef = cardOf(html, "定義のない人"), both = cardOf(html, "両方見せない人");
  for (const card of [none, nodef]) assert.ok(card.includes(`<p class="em-empty">${BLANK}</p>`) && !card.includes(HIDDEN) && count(card, "em-empty") === 1 && !card.includes("em-sec"));
  assert.ok(both.includes(`<p class="em-empty">${HIDDEN}</p>`) && !both.includes(BLANK) && count(both, "em-empty") === 1 && !both.includes("em-sec"));   // どちらも同じ理由なら、1つだけ
  assert.ok(!both.includes("表示される緊急") && !both.includes("表示される連絡先"));   // 見せない設定の内容は出さない
});

test("片方だけ見せない人:空の理由が違うときは、見出しごとに出し分ける。見せる方の内容は出る", async () => {
  const html = app.innerHTML;
  const em = cardOf(html, "緊急だけ見せない人");   // 緊急は見せない設定、連絡先の欄は(「連絡」を含む項目がなく)記入なし
  assert.strictEqual(count(em, "em-empty"), 2);
  assert.ok(em.indexOf("発作・緊急時") < em.indexOf(HIDDEN) && em.indexOf(HIDDEN) < em.indexOf("連絡先</h4>") && em.indexOf("連絡先</h4>") < em.indexOf(BLANK));
  assert.ok(!em.includes("表示される緊急") && !em.includes("連絡ではない"));
  const ct = cardOf(html, "連絡先だけ見せない人");   // 緊急は出る、連絡先は見せない設定
  assert.ok(ct.includes("表示される緊急") && !ct.includes("表示される連絡先") && count(ct, "em-empty") === 1);
  assert.ok(ct.indexOf("表示される緊急") < ct.indexOf("連絡先</h4>") && ct.indexOf("連絡先</h4>") < ct.indexOf(HIDDEN) && !ct.includes(BLANK));
});

test("チームごとの一覧(従来の画面)でも、同じ区別が出る", async () => {
  const id = get("teams.at(-1).id");
  toHome();
  await get(`handle("enter-team",{id:${JSON.stringify(id)}})`);
  await get(`handle("open-emergency",{})`);
  assert.strictEqual(get("view.screen"), "emergency");
  const cardH2 = (name) => { const html = app.innerHTML, i = html.indexOf(`>${name}</h2>`); assert.ok(i >= 0, name); return html.slice(html.lastIndexOf('<section class="em-person"', i), html.indexOf("</section>", i)); };
  assert.ok(cardH2("何もない人").includes(BLANK) && cardH2("定義のない人").includes(BLANK) && !cardH2("何もない人").includes(HIDDEN));
  assert.ok(cardH2("両方見せない人").includes(HIDDEN) && !cardH2("両方見せない人").includes(BLANK));
  const mixed = cardH2("緊急だけ見せない人");
  assert.ok(mixed.includes(HIDDEN) && mixed.includes(BLANK) && mixed.includes("<h3 class=\"em-sec-title\">連絡先</h3>"));   // チームごとの一覧は、人物が h2・項目が h3(従来どおり)
  // 自分のチームを「運営向け」の表示で見たときも、運営に見せない設定のトピックは「公開されていません」。「すべて」なら、そのまま出る
  await startSession("ea-own-staff", [ownTeam()], "team_own");
  run(`stage="ready"; view={teamId:"team_own",screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"staff"}; render()`);
  await get(`handle("open-emergency",{})`);
  const hana = cardH2("はなさん");
  assert.ok(hana.includes(HIDDEN) && !hana.includes("目が右上を向きます") && hana.includes("母: 000-0000-0000"));
  run(`view.audience="all"; render()`);
  assert.ok(app.innerHTML.includes("目が右上を向きます") && !app.innerHTML.includes(HIDDEN));
});

test("emergencyInfo の hidden は、トピックはあるが見せない設定のときだけ付く(トピックがない・中身が空では付かない。相手が all のときは見えるので付かない)", async () => {
  const info = (p, audience) => plain(get("emergencyInfo")(p, audience));
  const p = person("x", "x", { emergency: [{ label: "a", value: "b" }] });
  p.topicDefs.find((d) => d.id === "emergency").audience = ["student"];
  p.topicDefs = p.topicDefs.filter((d) => d.id !== "basic");   // 基本情報のトピックは、そもそもない
  let r = info(p, "staff");
  assert.deepStrictEqual(r.emergency, { def: null, entries: [], hidden: true });
  assert.deepStrictEqual(r.contact, { def: null, entries: [] });   // トピックがない:hidden は付かない(従来の形のまま)
  r = info(p, "all");
  assert.ok(r.emergency.def.id === "emergency" && r.emergency.entries.length === 1 && !("hidden" in r.emergency));
  r = info(p, "student");   // 学生には見える設定
  assert.ok(r.emergency.def.id === "emergency" && !("hidden" in r.emergency));
  r = info(person("y", "y"), "staff");   // トピックはあるが中身が空
  assert.ok(r.emergency.def.id === "emergency" && r.emergency.entries.length === 0 && !("hidden" in r.emergency));
});

test("emergencyAudience:自分のチームは all、受け取ったチームは source.audience(学生向けと、チームがないときは null)", async () => {
  const f = get("emergencyAudience");
  assert.strictEqual(f({ id: "a" }), "all");
  assert.strictEqual(f({ id: "a", source: { audience: "all" } }), "all");
  assert.strictEqual(f({ id: "a", source: { audience: "staff" } }), "staff");
  assert.strictEqual(f({ id: "a", source: { audience: "student" } }), null);
  assert.strictEqual(f(null), null);
  assert.strictEqual(f(undefined), null);
});

section("見るだけの画面(画面でも handle() でも)");

test("画面に出る操作は「← ホーム」だけ。編集・印刷・読み上げ・チームを開く操作はなく、tel: のリンクも入力欄もない", async () => {
  await startSession("ea-view", [ownTeam()], null);
  await receive(familyTeam("team_stf", "やまだ家", "みどり"), "staff");
  await open();
  const html = app.innerHTML;
  assert.deepStrictEqual(dataActs(html), SCREEN_ACTS);
  for (const act of NOT_ON_SCREEN) assert.ok(!html.includes(`data-act="${act}"`), act);
  assert.ok(html.includes("母: 000-0000-0000") && html.includes("みどりの連絡先 000"));   // 電話番号もただの文字
  assert.ok(!/tel:/i.test(html) && !/<a[\s>]/i.test(html) && !html.includes("href=") && !html.includes("<input") && !html.includes("<textarea") && !html.includes("<button class=\"tool-btn"));
  assert.ok(!html.includes("make-editable") && !html.includes("受け取った情報（"));   // チームの帯(削除や「編集できるようにする」のボタン)は出さない
});

test("handle() の二重の防御:一覧を開いたまま、編集などの操作を直接呼んでも、何も起きない(例外にならず、チーム・保存データ・画面・小窓・表示設定が変わらない)", async () => {
  await get("save()");   // 保存データがある状態にして、保存されないことも確かめる
  assert.strictEqual(get("currentScreen()"), "emergency-all");
  const ds = { id: "p_hana", v: "staff", i: "0" };
  const acts = [
    "edit-person", "add-person", "save-person", "del-person", "pick-photo", "clear-photo", "start-edit", "save-edit", "cancel-edit", "draft-add", "draft-remove",
    "add-topic", "save-topic", "toggle-organize", "del-topic", "move-up", "move-down", "edit-team", "save-team-edit", "del-team", "open-team-create", "create-team",
    "open-copyto", "copy-card", "set-audience", "make-editable", "open-person", "open-topic", "back-list", "back-person", "open-emergency", "enter-team",
    "settings", "open-about", "open-passchange", "passchange-save", "purge-legacy", "set-fs", "set-theme", "import", "share-team", "share-audience", "share-proceed", "print", "speak", "speak-topic",
    "discard-picker", "resume-picker", "unlock", "setup-go",
  ];
  env.confirmAnswer = true;
  for (const act of acts) {
    const before = stateOf();
    await get(`handle(${JSON.stringify(act)},${JSON.stringify(ds)})`);   // 例外にならない(await が失敗しない)
    assert.strictEqual(stateOf(), before, `${act} が状態を変えた`);
  }
  assert.strictEqual(get("currentScreen()"), "emergency-all");
});

test("対照:同じ操作は、一覧を開いていないホームでは通る(上のテストが空振りでないことの確認)。通る操作:閉じる・ロック・ホームへ戻る", async () => {
  toHome();
  await get(`handle("settings",{})`); assert.strictEqual(get("modal"), "settings");
  await get(`handle("close-modal",{})`); assert.strictEqual(get("modal"), null);
  await get(`handle("open-team-create",{})`); assert.strictEqual(get("modal"), "team");
  await get(`handle("close-modal",{})`);
  await get(`handle("open-emergency-all",{})`);
  run(`modal="about"; render()`);   // 小窓が開いたままの一覧(ふつうは起きない)でも、閉じる操作は通る
  await get(`handle("close-modal",{})`);
  assert.ok(get("modal") === null && get("currentScreen()") === "emergency-all");
  await get(`handle("back-home",{})`);
  assert.ok(get("stage") === "home" && get("view.screen") === "list" && get("currentScreen()") === "home");
  await get(`handle("open-emergency-all",{})`);
  await get(`handle("lock-manual",{})`);   // ロックは通る
  assert.ok(get("stage") === "locked" && get("cryptoKey") === null);
});

test("チームの中・ロック中・起動中は、open-emergency-all を直接呼んでも何もしない(ホームからだけ開く)", async () => {
  await startSession("ea-stages", [ownTeam()], "team_own");
  run(`stage="ready"; view={teamId:"team_own",screen:"list",personId:null,topicId:null,editing:false,organize:false,audience:"all"}; modal=null; render()`);
  for (const stage of ["ready", "locked", "boot", "setup-pass"]) {
    run(`stage=${JSON.stringify(stage)}`);
    const before = JSON.stringify([get("stage"), get("view")]);
    await get(`handle("open-emergency-all",{})`);
    assert.strictEqual(JSON.stringify([get("stage"), get("view")]), before, stage);
  }
});

section("戻る操作(ホームが深さ0、この画面が深さ1)とロック");

const popstate = async (state = null) => { for (const fn of windowHandlers.popstate) await fn({ state }); };
const where = () => `${get("stage")}/${get("view.screen")}/${get("modal")}`;

test("「← ホーム」(back-home)でホームに戻る。ホームには、ボタンつきのチーム一覧が描かれる", async () => {
  await startSession("ea-back", [ownTeam()], null);
  await receive(familyTeam("team_stf", "やまだ家", "みどり"), "staff");
  await open();
  assert.strictEqual(where(), "home/emergency-all/null");
  await get(`handle("back-home",{})`);
  assert.strictEqual(where(), "home/list/null");
  assert.ok(get("currentScreen()") === "home" && get("navDepth()") === 0 && get("view.teamId") === null);
  assert.ok(app.innerHTML.includes("ホーム") && app.innerHTML.includes('data-act="open-emergency-all"') && app.innerHTML.includes('data-act="enter-team"') && !app.innerHTML.includes("em-team"));
});

test("端末やブラウザの「戻る」(popstate)で、一段戻る:小窓が開いていれば先に閉じ、次にホームへ。ホームでは何もしない", async () => {
  await open();
  run(`modal="about"; render()`);
  assert.strictEqual(get("navDepth()"), 2);   // 小窓が開いていれば +1
  await popstate(); assert.strictEqual(where(), "home/emergency-all/null");   // 小窓を閉じる
  await popstate(); assert.strictEqual(where(), "home/list/null");            // ホームへ
  const before = JSON.stringify([get("stage"), get("view"), get("teams")]);
  await popstate(); await popstate();
  assert.strictEqual(JSON.stringify([get("stage"), get("view"), get("teams")]), before);   // ホームでは何もしない
});

test("画面が変わるので、開くときと戻るときに、それぞれ先頭へスクロールする(scrollTo(0,0)を1回)", async () => {
  const scrolls = [];
  context.window.scrollTo = (x, y) => { scrolls.push([x, y]); };
  toHome(); scrolls.length = 0;
  await get(`handle("open-emergency-all",{})`); assert.deepStrictEqual(scrolls, [[0, 0]]);
  scrolls.length = 0;
  run("render(); render()"); assert.deepStrictEqual(scrolls, []);   // 同じ画面の描き直しではスクロールしない
  await get(`handle("back-home",{})`); assert.deepStrictEqual(scrolls, [[0, 0]]);
  context.window.scrollTo = () => {};
});

test("ロック中は何もしない:一覧を開いたままロックすると、内容は画面にも状態にも残らない。ロック中の戻る・開く操作は何も起こさない。解錠後はホームから始まる", async () => {
  await get("save()");
  await open();
  assert.ok(app.innerHTML.includes("母: 000-0000-0000"));
  await get("lockNow()");
  assert.strictEqual(where(), "locked/list/null");
  const html = app.innerHTML;
  assert.ok(!html.includes("000-0000-0000") && !html.includes("em-team") && !html.includes("em-person") && get("teams.length") === 0);
  const before = JSON.stringify([get("stage"), get("view"), get("teams"), get("modal")]);
  await popstate(); await popstate({ sc: 0 }); await popstate({ sc: 1 });
  await get(`handle("open-emergency-all",{})`);   // ロック中は開けない
  assert.strictEqual(JSON.stringify([get("stage"), get("view"), get("teams"), get("modal")]), before);
  assert.ok(get("stage") === "locked" && get("cryptoKey") === null && app.innerHTML === html);
  await get(`unlock("ea-back")`);
  assert.strictEqual(where(), "home/list/null");   // 一覧には戻らない(ホーム)
  assert.ok(get("currentScreen()") === "home" && get("navDepth()") === 0 && !app.innerHTML.includes("em-team"));
});

test("自動ロックの仕組み(stage が home のまま)がそのまま効く:一覧を開いたまま、画面が隠れると(visibilitychange)ロックされる", async () => {
  await open();
  assert.strictEqual(get("currentScreen()"), "emergency-all");
  env.document.hidden = true;
  for (const fn of env.handlers.visibilitychange || []) fn();
  env.document.hidden = false;
  assert.ok(get("stage") === "locked" && get("view.screen") === "list" && get("teams.length") === 0);
  assert.ok(!app.innerHTML.includes("em-team"));
});

// 履歴のスタブがあるアプリで、深さと履歴の動きを確かめる
const env2 = createApp();
const hist = installHistory(env2);
const depth = () => plain({ app: env2.get("navDepth()"), hist: env2.get("histDepth"), state: hist.history.state?.sc, index: hist.index() });
const sameDepth = (n) => assert.deepStrictEqual(depth(), { app: n, hist: n, state: n, index: n });
const where2 = () => `${env2.get("stage")}/${env2.get("view.screen")}/${env2.get("modal")}`;

test("履歴あり:開くと履歴を1つ積む(深さ0 → 1)。端末の「戻る」を押すと、ホームに戻る(アプリが履歴を余計に動かさない)", async () => {
  await env2.startSession("ea-hist", [ownTeam()], null);
  env2.run(HOME); env2.run("initHistory()");
  sameDepth(0);
  await env2.get(`handle("open-emergency-all",{})`);
  sameDepth(1);
  assert.deepStrictEqual(plain(hist.calls.filter(([k]) => k === "push").map(([, s]) => s)), [{ sc: 1 }]);
  hist.history.back(); await hist.settle();
  assert.strictEqual(where2(), "home/list/null");
  sameDepth(0);
  assert.strictEqual(hist.calls.filter(([k]) => k === "go").length, 1);   // 呼んだのは、いまの1回だけ
});

test("履歴あり:「← ホーム」のボタンで戻ると、履歴も1つ戻る(その popstate では、画面をさらに戻さない)。ホームで「戻る」を押しても何も起きない", async () => {
  await env2.get(`handle("open-emergency-all",{})`);
  sameDepth(1);
  const gos = () => hist.calls.filter(([k]) => k === "go").length, before = gos();
  await env2.get(`handle("back-home",{})`);
  assert.strictEqual(gos(), before + 1);
  await hist.settle();
  assert.strictEqual(where2(), "home/list/null");
  sameDepth(0);
  hist.history.back(); await hist.settle();   // ホーム(位置0)では戻れない
  assert.strictEqual(where2(), "home/list/null");
  sameDepth(0);
});

test("履歴あり:一覧を開いたままロックすると、履歴は先頭(深さ0)に戻り、ロック中の「戻る」では何も起きない", async () => {
  await env2.get(`handle("open-emergency-all",{})`);
  sameDepth(1);
  await env2.get("lockNow()"); await hist.settle();
  assert.strictEqual(env2.get("stage"), "locked");
  sameDepth(0);
  for (const fn of env2.windowHandlers.popstate) await fn({ state: { sc: 0 } });
  assert.ok(env2.get("stage") === "locked" && env2.get("view.screen") === "list");
});

section("見た目(css の静的な検査)");

test("新しい部品(.em-team-name・.em-team-sub)の文字サイズは、文字サイズの設定(--fs-add)が効く。チームの見出しは線(主な操作の色)で区切り、チームの色は使わない", async () => {
  const css = readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
  const body = (selector) => { const m = css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`)); assert.ok(m, selector); return m[1]; };
  for (const selector of [".em-team-name", ".em-team-sub"]) assert.match(body(selector), /font-size:calc\([\d.]+px \+ var\(--fs-add\)\)/, selector);
  assert.match(body(".em-team-head"), /border-bottom:2px solid var\(--primary\)/);
  assert.ok(!body(".em-team-head").includes("--accent"));
  assert.match(body(".em-all-title"), /word-break:keep-all/);   // 狭い画面で、題名を括弧の途中で折り返さない
});
