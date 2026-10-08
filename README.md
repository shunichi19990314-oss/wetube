# WeTube — 自作YouTube風クライアント（Railwayデプロイ対応）

`https://wetube-eqbm.onrender.com/` を **リバースエンジニアリングして機能を洗い出し、サーバ／フロントをゼロから書き直した** 実装です。
URL構成・API・画面構成・操作性（テーマ切替、シアターモード、ミニプレーヤー、キーボードショートカット、キュー、TVデバイス認証ログイン、ライブチャット、コメント、ダウンロード）を同一仕様で再現しています。

> **実装方針**: 参照サイトの CSS / JS / HTML は一切コピーしていません。挙動とAPI形状を観測し、同等の機能を独自コードで実装しています。ブランド名・ロゴは `BRAND_NAME` / `public/images/logo.png` で差し替え可能（既定は "WeTube"）。

---

## 1. 対応機能

| 領域 | 内容 |
| --- | --- |
| ディスカバリ | ホーム、急上昇、音楽、ゲーム、ニュース、Shorts シェルフ、カテゴリチップ |
| 検索 | サジェスト（`suggestqueries`）、検索タイプ（すべて／動画／チャンネル／再生リスト／映画）、並び替え（関連度・日付・再生回数・評価）、無限スクロール |
| 再生 | 埋め込みプレーヤー（YouTube / nocookie / ミラー / ダイレクト再生）、シアターモード、全画面、ミニプレーヤー、自動再生カウントダウン、再生速度、ストリーム情報＆ダウンロード |
| 再生ページ | 高評価／低評価、後で見る、キュー、共有、登録、説明（展開・ハッシュタグ・リンク）、関連動画の続き、コメント（上位／新着・続き・返信）、ライブチャット（ポーリング・フィルタ） |
| チャンネル | バナー／アイコン／統計／説明、タブ（動画・ショート・再生リスト・投稿）、登録ボタン、続き読み込み、`/@handle` 形式URL |
| Shorts | 縦送り（ボタン・ホイール・スワイプ・キー）、URL同期 |
| ライブラリ | 履歴、再生リスト、後で見る、高く評価した動画、登録チャンネル、あなたのチャンネル、設定 |
| アカウント | **YouTube TVデバイス認証**（`youtube.com/activate` にコード入力）、ログイン状態の同期（履歴・登録・高評価・後で見る・通知）、トークン自動リフレッシュ |
| UI | ダーク／ライト／端末設定、モバイル底部ナビ、トースト、スケルトン、ページ進捗バー、キーボードショートカット一覧 |
| インフラ | 画像プロキシ（ホスト許可リスト）、TTL+LRUキャッシュ、stale-while-revalidate、シングルフライト、レート制限、署名付きセッションCookie、`/healthz` |

### 画面・URL（参照サイトと同一）

```
/                       ホーム
/feed/trending          急上昇
/feed/music             音楽
/feed/gaming            ゲーム
/feed/news              ニュース
/search?q=…&sp=…        検索
/watch?v=…&list=…       再生
/channel/UC…            チャンネル
/@handle                チャンネル（handle形式）
/shorts , /shorts/:id   Shorts
/playlist?list=…        再生リスト
/history /liked /watch-later /subscriptions /playlists /my-channel /settings
/image-proxy?url=…      画像プロキシ
```

### API（参照サイトと同一のサーフェス）

```
GET  /api/auth/status            POST /api/auth/start          POST /api/auth/signout
GET  /api/account/history        GET  /api/account/history/next
GET  /api/account/liked          GET  /api/account/subscriptions
GET  /api/account/watch-later    GET  /api/account/playlists
GET  /api/account/video-state    GET  /api/account/channel-state
POST /api/interact               GET  /api/notifications
POST /api/feed/next              GET  /api/feed/next           GET /api/search/next
GET  /api/channel/next           GET  /api/related/next        GET /api/recommendations
GET  /api/suggestions            GET  /api/videos?ids=…        GET /api/stream-info?v=…
GET  /api/comments               GET  /api/comments/next       GET /api/comment-replies
POST /api/live-chat/start        GET  /api/live-chat/:token/events
POST /api/live-chat/:token/filter
GET  /api/health                 GET  /healthz
```

---

## 2. アーキテクチャ

```
src/
  index.js              express 起動・画像プロキシ・静的配信・レート制限
  config.js             環境変数の一元管理
  http.js               依存ゼロのHTTP層（CONNECTプロキシ対応）
  session.js            署名Cookie（hex32.base64url-HMAC）+ セッションストア
  cache.js              TTL/LRU + stale-while-revalidate + single-flight
  youtube/
    innertube.js        InnerTubeクライアント（WEB/TVHTML5/ANDROID/IOS）+ TV OAuth
    parsers.js          新旧両形式の正規化（videoRenderer / lockupViewModel 他）
    service.js          フィード・検索・チャンネル・再生・コメント・Shorts
    account.js          ログイン状態・履歴・高評価・登録・通知・interact
    livechat.js         ライブチャット取得
  services/stream.js    ダイレクトURL解決（awakest / innertube / custom）
  views/ui.js           シェル（topbar・sidebar・ダイアログ・カード）
  views/pages.js        各ページのレンダラ
  routes/pages.js       HTMLルート
  routes/api.js         JSONルート
public/
  style.css → styles/{base,discovery-pages,library-shorts}.css
  app.js + scripts/app-*.js（17本）
```

**依存は `express` と `cookie-parser` のみ。** ビルド工程なし、`node src/index.js` で動きます。

### 設計上のポイント（本家と同じ挙動にするための判断）

1. **急上昇／音楽／ゲーム／ニュースは「検索ベース」** — YouTubeは旧Trending系browseId（`FEtrending` 等）を廃止しており、全クライアントで `400 INVALID_ARGUMENT` になります。本家も同様に検索で実現していることを確認済み（例: `/feed/trending` は「急上昇」検索、`/feed/music` は「音楽」検索で、検索ボックスにもその語が入る）。クエリは `HOME_QUERY` 等で変更可。
2. **プレイヤーは埋め込みが既定** — データセンターIPからの `player` 応答は高頻度で拒否されるため、既定はYouTube埋め込みiframe。「ダイレクト再生」を選ぶと `/api/stream-info` で解決したURLを `<video>` で再生します（本家と同じ経路）。
3. **動画メタデータの二段フォールバック** — `player` が失敗しても `next` からタイトル・チャンネル・再生数・日付を取得できるので、カード情報が壊れません。
4. **ストリームURLのプロバイダ連鎖** — `STREAM_PROVIDER_ORDER=awakest,innertube,custom` の順に試し、全て失敗すると本家と同じ文言（`awakest.net からストリームURLを取得できませんでした。`）を返します。

---

## 3. ローカル起動

```bash
git clone <your-repo> && cd wetube
npm install
cp .env.example .env       # SESSION_SECRET を設定
npm start                  # http://localhost:3000
```

動作確認:

```bash
curl -s localhost:3000/api/health
curl -s "localhost:3000/api/suggestions?q=アニ"
```

---

## 4. Railway デプロイ

### A. CLI（推奨）

```bash
npm i -g @railway/cli
railway login
cd wetube
railway init                      # プロジェクト作成
railway up                        # Dockerfile が自動検出されます
railway domain                    # 公開ドメイン発行
railway variables --set "SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
railway variables --set "BASE_URL=https://<発行されたドメイン>"
railway redeploy
```

### B. ダッシュボード

1. GitHub にこのリポジトリを push
2. Railway → **New Project → Deploy from GitHub repo**
3. **Variables** に `.env.example` の内容を貼り付け（最低限 `SESSION_SECRET`、`BASE_URL`）
4. **Settings → Build** が `Dockerfile` を拾っていることを確認（`railway.json` があるため自動）
5. **Settings → Networking → Generate Domain**
6. デプロイ後 `https://<domain>/healthz` が `{"ok":true}` なら成功

> Nixpacks を使いたい場合は `Dockerfile` / `railway.json` / `railway.toml` を削除するだけで、`package.json` の `start` スクリプトがそのまま使われます。

### 必須／推奨の環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `SESSION_SECRET` | **○** | 未設定だと起動ごとにランダム生成 → デプロイのたびに全員ログアウト |
| `BASE_URL` | 推奨 | 共有リンク生成に使用（`RAILWAY_PUBLIC_DOMAIN` でも可） |
| `YT_PROXY` | 強く推奨 | 下記「YouTubeのIPブロック対策」 |
| `STREAM_PROVIDER_ORDER` | 任意 | ダイレクト再生／ダウンロードの解決順 |
| `EMBED_MIRRORS` | 任意 | 代替埋め込みプレイヤー（カンマ区切り） |

---

## 5. YouTube の IP ブロック対策（最重要）

Railway / Render / Fly などの **データセンターIPはYouTubeに高確率でブロックされます**。本家サイトが現在 `503`（`うまく読み込めませんでした`／`awakest.net からストリームURLを取得できませんでした。`）になっているのもこれが原因です。症状と対処は以下の通り。

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| 検索・ホームは出るが `/watch` がエラー | `player` / `next` の拒否 | `YT_PROXY` を設定（下記） |
| コメントが `502` | `next` の拒否 | 同上 |
| ダイレクト再生・ダウンロード不可 | `videoplayback` URL が取れない | `YT_PROXY` ＋ `STREAM_PROVIDER_ORDER=custom,innertube` |
| ログインが始まらない | `youtube.com/tv` 取得失敗 | `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` を直接指定 |

### プロキシ設定

```bash
railway variables --set "YT_PROXY=http://user:pass@proxy-host:port"
```

住宅用プロキシ（Bright Data / IPRoyal / Smartproxy 等）を1本噛ませると、メタデータ・コメント・ログイン・ストリームURLまで一通り通ります。プロキシ未設定でも **検索・ホーム・チャンネル・Shorts・埋め込み再生** は多くの環境で動作します（本実装は `player` 失敗時に `next` へフォールバックするため）。

### 自力エンドポイントを使う場合

Invidious / Piped / 自作APIを `STREAM_API_URL` に指定できます。

```bash
railway variables --set "STREAM_API_URL=https://inv.example.net/api/v1/videos/{id}"
```

Invidious形式JSON（`formatStreams` / `adaptiveFormats`）、単純なJSON配列、`googlevideo.com/videoplayback` を含むHTML のいずれでも自動判別します。

---

## 6. 動作確認チェックリスト

```bash
curl -s $BASE/healthz                                   # {"ok":true}
curl -s "$BASE/api/health"                              # version / provider / proxy
curl -s "$BASE/api/suggestions?q=アニ"                   # {"suggestions":[...]}
curl -s "$BASE/api/videos?ids=dQw4w9WgXcQ"              # メタデータ
curl -s "$BASE/api/comments?v=dQw4w9WgXcQ&sort=top"     # コメント
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/"       # 200
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/feed/trending"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/watch?v=dQw4w9WgXcQ"
```

ブラウザ側:
- [ ] ホームのグリッドが表示され、スクロールで続きが読み込まれる
- [ ] 検索サジェストが出る／Enterで検索
- [ ] 再生ページのコメント・関連動画が出る
- [ ] テーマ切替（アカウント → デザイン）が効く
- [ ] `t` / `f` / `i` / `k` / `m` / `/` のショートカット
- [ ] カードの ⋮ → キュー追加／後で見る
- [ ] モバイル幅で底部ナビ＋ハンバーガーメニュー

---

## 7. 既知の制限

- **ダイレクト再生／ダウンロード** は上流（awakest.net 等）の可用性に依存します。既定の埋め込み再生は常に使えます。
- **ログイン後の同期** はYouTube側のTV OAuth scope（`youtube-third-party-link`）に依存し、取得できるデータは履歴・登録チャンネル・高評価・後で見る・通知です。コメント投稿は未実装（入力欄は無効表示）。
- セッションは既定でメモリ保持のため、**複数レプリカでは `numReplicas: 1`** を維持するか `REDIS_URL` 用のストアを実装してください（`src/session.js` の `sessionStore` を差し替えるだけです）。
- Shorts・チャンネル「投稿」タブなど一部は YouTube の応答形式次第で空になります。

## 8. 法的注意

- YouTube の名称・ロゴは Google LLC の商標です。公開する場合は `BRAND_NAME` と `public/images/logo.png` を独自のものに差し替えてください。
- 動画のダウンロード機能は地域の法令および YouTube の利用規約に従って、自己責任で有効/無効（`ENABLE_DOWNLOADS=false`）を判断してください。
- 本リポジトリは学習・互換性目的の独自実装です。

## 9. ライセンス

MIT（`LICENSE` を追加して利用してください）
