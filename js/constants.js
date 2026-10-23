/* ============================================================
   js/constants.js ― 定数(最初に読み込む)
   ------------------------------------------------------------
   役割:アプリ全体で使う、変わらない値だけを置く。処理(関数)は置かない。
   主な定数:
     APP_VERSION / STORE_KEY / META_KEY / LEGACY_KEY / PREFS_KEY(保存キー)
     AUTO_LOCK_MIN(自動ロックまでの分数)/ PICKER_PENDING_MS(選んだファイルを保留する時間)
     LOCKOUTS(パスコードの失敗回数ごとの待機秒)
     DEFAULT_TOPICS / SAMPLE_TEAM(初期のトピックと、新しくインストールしたときだけ入るサンプルのチーム)
     AUDIENCES / DEFAULT_AUDIENCE / VIEW_AUDIENCES / SHARE_AUDIENCES / AUDIENCE_NAMES
       (トピックを見せる相手と、その初期値・表示の切り替え・書き出す相手・呼び名)
     STUDENT_PAGE_ORDER / STUDENT_NOTICE(学生向け「はじめましてページ」のトピックの並び順と、固定の案内)
     EMERGENCY_NOTE(緊急時の情報の一覧の上部に出す、固定の注記)
     TOPIC_HINTS(トピックごとの記入例)
     THEMES(表示設定のテーマの一覧。color は設定画面に出す見本の色で、css の各テーマの「主な操作の色」と同じ値)
     ※人物・チーム・トピックの emoji / icon / color は、保存データと共有ファイルの項目として残すが、画面には使わない
       (アイコンは icons.js の topicIcon、色は css が決める)。選ぶ欄はない。
   依存:ほかのアプリのファイルには依存しない。

   ファイルの分け方と読み込み順(index.html の script と同じ順):
     constants → util → icons → crypto → data → private-notes → reorder → share-format → state → views → actions → main
     すべて classic script で、グローバル(function / let / const)を共有する。
     後のファイルのトップレベルの let / const を、読み込み時に実行されるコードから参照しない
     (初期化前の参照になる)。関数の中から参照するのは問題ない。
     各ファイルの先頭に "use strict" を置く(分割前の app.js と同じ厳格モードで動かすため)。

   下の「サポートカード app.js」のコメントは、分割前の app.js の冒頭をそのまま残したもの。
   編集ガイドの対応先は、DEFAULT_TOPICS と AUTO_LOCK_MIN がこのファイル、
   ○○Screen 関数が views.js、handle() が actions.js。
   ============================================================ */

/* ============================================================
   サポートカード app.js
   ------------------------------------------------------------
   ・データはこの端末のブラウザ内のみに保存(外部送信なし)
   ・端末のパスコードと共有ファイルのパスコードで暗号化(AES-256-GCM)
   ・総当たり対策:連続失敗で待機時間が伸びる
   ・15分操作がないと自動ロック/バックグラウンドで画面を隠す
   ・チーム制:目的ごとにカードをまとめる
   ・共有:暗号化ファイル(.scard)の書き出し→相手が読み込み

   編集ガイド:
   1. 初期トピック → DEFAULT_TOPICS
   2. 自動ロック時間 → AUTO_LOCK_MIN
   3. 各画面のHTML → ○○Screen 関数
   4. ボタンの動作 → handle()
   ============================================================ */
"use strict";

const APP_VERSION = "1.1.0-trial";
const STORE_KEY = "support-card-local-v1";   // 暗号化データの保存先
const META_KEY  = "support-card-meta-v1";    // 試行回数など(非機密)
const LEGACY_KEY = "support-card-data-v2";    // 旧版(暗号化なし)のデータ。移行を確認できたら削除する
const AUTO_LOCK_MIN = 15;                     // 自動ロックまでの分数(変えるときはここ)

const PICKER_PENDING_MS = 3 * 60 * 1000;

const LOCKOUTS = [0,0,0,5,15,30,60]; // 失敗回数→待機秒。6回目以降は60秒

// ================= データ定義 =================
// icon・color は、保存データと共有ファイルの形を保つために残している値。画面には使わない(アイコンは icons.js の topicIcon が id で決め、色は css が決める)
const DEFAULT_TOPICS = [
  { id:"emergency", icon:"🚨", title:"発作・緊急時", color:"#E05B4B", desc:"まずこれを見てください", urgent:true },
  { id:"basic", icon:"👤", title:"基本情報", color:"#5B8DB8", desc:"名前・生年月日・連絡先" },
  { id:"communication", icon:"💬", title:"コミュニケーション", color:"#3D7399", desc:"伝え方・その人のサイン" },
  { id:"activity", icon:"🎨", title:"一緒に活動するとき", color:"#C2724E", desc:"参加のしかた・手伝い方・敏感なこと" },   // 新しく作るカードにだけ入る(既存のカードの topicDefs は変えない)
  { id:"meal", icon:"🍽️", title:"食事・水分", color:"#D98E32", desc:"形態・とろみ・禁止のもの" },
  { id:"care", icon:"💊", title:"医療的ケア", color:"#8A6FC8", desc:"薬・吸引・注入など" },
  { id:"posture", icon:"🛏️", title:"姿勢・移動", color:"#4E9A6E", desc:"抱き方・車いす・注意点" },
  { id:"likes", icon:"🌟", title:"好きなこと", color:"#E8A93C", desc:"笑顔になるもの" },
  { id:"dislikes", icon:"😣", title:"苦手なこと", color:"#B06A8C", desc:"避けてほしいこと" },
];

// ---- 相手(トピックを見せる相手) ----
// カードの作成者はすべてのトピックを確認できるため、共有先には含めない。初期値は必要に応じて見直す。
const AUDIENCES = [
  { id:"student", label:"学生（一緒に参加する人）", short:"学生" },
  { id:"staff", label:"運営スタッフ", short:"運営" },
];
// トピックごとの公開先の初期値。ここにないトピック(自作など)は [] = 家族のみ。保存データには書き戻さず、表示のときに補う
const DEFAULT_AUDIENCE = {
  emergency:["staff"], basic:["staff"], communication:["student","staff"], activity:["student","staff"],
  meal:["staff"], care:["staff"], posture:["staff"], likes:["student","staff"], dislikes:["student","staff"],
};
// 人物ページの「表示: すべて / 学生向け / 運営向け」の切り替え
const VIEW_AUDIENCES = [
  { id:"all", label:"すべて" },
  { id:"student", label:"学生向け" },
  { id:"staff", label:"運営向け" },
];
// 共有ファイルを書き出す相手。範囲の狭い順(先頭が初期値)。「すべて」は家族どうし・控え用
const SHARE_AUDIENCES = [
  { id:"student", label:"学生（一緒に参加する人）向け" },
  { id:"staff", label:"運営スタッフ向け" },
  { id:"all", label:"すべて（家族どうし・控え用）" },
];
// 受け取った情報の帯と、印刷の見出しに出す、相手の呼び名
const AUDIENCE_NAMES = { student:"学生（一緒に参加する人）向け", staff:"運営スタッフ向け", all:"すべて" };

// ---- 学生向け「はじめましてページ」 ----
// 学生向けページでは、伝え方 → 一緒に活動するとき → 好き → 苦手 の順に表示する。
// ここにない学生向けのトピック(自作など)は、そのあとに topicDefs の順で並べる。
const STUDENT_PAGE_ORDER = ["communication","activity","likes","dislikes"];
// ページの最後と印刷に、いつも出す案内。医療的な指示は書かない(医療的ケアは付き添いの方と医師が担う)
const STUDENT_NOTICE = "いつもと様子がちがうと感じたら、すぐに付き添いの方かスタッフに伝えてください。";

// ---- 緊急時の情報の一覧 ----
// 一覧の上部に、いつも出す注記(チームごとの一覧と、ホームの「すべてのチーム」の一覧で同じ)。医療的な指示は書かない(医療的な判断は、付き添いの方と医療者が行う)
const EMERGENCY_NOTE = "この一覧は、運営スタッフが状況を共有するためのものです。医療的な判断は、付き添いの方と医療者が行います。";

// ---- 記入例 ----
// トピックIDごとの記入例。編集モードの入力欄の上と、未記入の詳細画面に出す。自作のトピックにはない。
const TOPIC_HINTS = {
  emergency:"発作などのサイン／まずしてほしいこと（付き添いの方に伝える など）／救急車を呼ぶ目安／緊急連絡先",
  basic:"呼ばれたい名前／年齢／緊急連絡先（必要なものだけ）",
  communication:"視線・手の動き・表情など、気持ちが伝わるサイン／「はい・いいえ」の伝え方／話しかけるときのコツ（位置・声の大きさ・返事を待つ時間）",
  activity:"参加のしかた（見る・さわる・手を添えると一緒にできる など）／光・音・におい・さわられることへの敏感さ／休けいの目安・疲れたときのサイン",
  meal:"食べ方の形態／とろみ／食べてはいけないもの・アレルギー",
  care:"時間が決まっているケア／してはいけないこと",
  posture:"車いすの押し方／移乗の方法／痛がる姿勢",
  likes:"好きなこと・得意なこと／一緒に楽しめること",
  dislikes:"苦手な音・場所／いやなときのサイン／避けてほしいこと",
};

// 新しくインストールしたときだけ入るサンプル(既存の利用者のデータは変えない)。20代の架空の人物。
// 生年月日や電話番号は入れない(必要以上に書かない例を示すため)。公開先は、各トピックの初期値(DEFAULT_AUDIENCE)のまま
const SAMPLE_TEAM = {
  id:"team_sample", name:"サンプル（架空の人物）", emoji:"🏠", color:"#3D7399",
  people:[{
    id:"sample", name:"はなさん", emoji:"🌸", photo:null, note:"音楽と、キラキラ光るものが大好きです",
    topicDefs: structuredClone(DEFAULT_TOPICS),
    topics:{
      emergency:[
        {label:"発作のサイン", value:"目が右上を向いて、体がかたくなります"},
        {label:"まずしてほしいこと", value:"すぐに付き添いの方に伝えてください"},
      ],
      basic:[
        {label:"呼ばれたい名前", value:"はなさん"},
      ],
      communication:[
        {label:"はい・いいえ", value:"「はい」のときは目をゆっくり閉じます。「いいえ」のときは顔をそらします"},
        {label:"うれしいとき", value:"目を大きく開けて、声を出して笑います"},
        {label:"話しかけ方", value:"正面か左側から、名前を呼んでから、ゆっくり話してください。返事には少し時間がかかります"},
      ],
      activity:[
        {label:"参加のしかた", value:"手を添えると、一緒にシールを貼ったり、ブロックを置いたりできます"},
        {label:"敏感なこと", value:"急な大きい音にびっくりします"},
      ],
      likes:[{label:"好きなこと", value:"アイドルの曲、万華鏡、光るもの"}],
      dislikes:[{label:"苦手なこと", value:"後ろから急に話しかけられること"}],
    },
  }],
};

// ---- 表示設定 ----
// 4つのテーマ。どれも白地で、薄い面の色と主な操作の色(color)だけが違う。color は css の body[data-theme] の --primary と同じ値
const PREFS_KEY = "support-card-prefs-v1";
const THEMES = [
  { id:"milk", label:"ミルク", color:"#2F6E96" },
  { id:"sakura", label:"さくら", color:"#7B4B80" },
  { id:"sora", label:"そら", color:"#12689E" },
  { id:"wakaba", label:"わかば", color:"#3A7452" },
];
