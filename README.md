# 集計システム (Node.js/Socket.io版)

親機と子機で点数を集計し、リアルタイムで表示・得点発表を行うWebアプリケーションです。

## 必要環境

- Node.js 16.x以上
- npm

## インストール

```bash
npm install
```

## 起動方法

### Electron（親機・推奨）

Node.js を別途起動しなくてよいランチャー付きアプリです。

```bash
npm install
npm run electron
```

または `親機起動.bat` をダブルクリック。

1. ランチャーで **サーバーを起動**
2. 表示された **親機 / 子機のURL** を確認（LAN用は別端末向け）
3. **親機を開く** / **親機点数画面を開く**（得点発表）を個別に起動

インストーラー作成:

```bash
npm run dist:all
```

- 親機: `dist/parent/集計システム 親機-Setup-1.0.0.exe`
- 子機: `dist/child/集計システム 子機-Setup-1.0.0.exe`

リリース: [GitHub Releases](https://github.com/honi0907/syukei/releases)

同一PCに親機・子機の両方を入れる場合、**別フォルダ**にインストールしてください（v1.0.3以降は既定で `syukei-parent` / `syukei-client` に分かれます）。以前の `syukei-system` フォルダはアンインストールしてから入れ直すと安全です。

親機ランチャー（または子機接続画面）の「更新を確認」から、**ダウンロード・インストール・再起動**までアプリ内で実行できます（インストール版のみ）。

### ブラウザのみ（従来）

```bash
npm start
```

サーバーが起動したら、以下のURLにアクセスします：

- **親機**: http://localhost:5555
- **子機**: http://localhost:5555/client
- **ランキング**: http://localhost:5555/ranking

## 使い方

1. **親機を開く**
   - ブラウザで http://localhost:5555 にアクセス
   - 合計得点と接続中の子機が表示されます
   - コントロールパネルから各種操作が可能

2. **子機を接続**
   - ブラウザで http://localhost:5555/client にアクセス
   - 子機名を入力して接続
   - テンキーで点数を入力し「決定」で送信

3. **得点発表**
   - 親機の「得点発表」ボタンをクリック
   - 新しいウィンドウでアニメーション付きランキングが表示されます

## 機能

- リアルタイム点数集計
- 自動ロック機能（送信後に自動ロック）
- 送信履歴表示
- ランキングアニメーション
- レスポンシブデザイン

## 技術スタック

- Node.js + Express
- Socket.io (WebSocket通信)
- HTML5 + CSS3 + JavaScript
- Canvas API (パーティクルエフェクト)

## ポート変更

デフォルトは5555ポートです。変更する場合は`server.js`の以下の行を編集：

```javascript
const PORT = 5555;  // お好みのポート番号に変更
```
