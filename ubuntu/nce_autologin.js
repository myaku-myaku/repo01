const puppeteer = require('puppeteer');

// 環境変数から認証情報を取得(セキュリティ対策)
const USERNAME = process.env.NCE_USERNAME || 'kurosaki.taishi';
const PASSWORD = process.env.NCE_PASSWORD || 'Changeme_123#';
const LOGIN_URL = process.env.NCE_LOGIN_URL || 'https://10.212.0.122:31943/unisso/login.action?service=%2Funisess%2Fv1%2Fauth%3Fservice%3D%252Fncecommonwebsite%252Fv1%252Fnewportal%252Findex.html%253Frefr-flags%253De&decision=1';

// ログ出力関数
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 待機用のヘルパー関数
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 自動ログインメイン処理
async function autoLogin() {
  let browser;
  
  try {
    log('ブラウザを起動します...');
    
    // 環境変数でヘッドレスモードを制御（デフォルトはtrue）
    const headlessMode = process.env.HEADLESS !== 'false';
    
    browser = await puppeteer.launch({
      headless: headlessMode,
      slowMo: headlessMode ? 0 : 50, // ヘッドレスモードでは高速化
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--ignore-certificate-errors', // 自己署名証明書を許可
        '--ignore-certificate-errors-spki-list'
      ]
    });
    
    const page = await browser.newPage();
    
    // ビューポートサイズを設定（大きめに）
    await page.setViewport({ width: 1920, height: 1080 });
    
    // タイムアウト設定を延長
    page.setDefaultTimeout(60000);
    
    // User-Agentを設定
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    log(`ログインページへ移動: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
    
    // ページのスクリーンショットを保存（デバッグ用）
    await page.screenshot({ path: '/tmp/nce_login_page.png' });
    log('スクリーンショット保存: /tmp/nce_login_page.png');
    
    // ログインフォームの入力
    log('ユーザー名を入力...');
    await page.waitForSelector('#username', { visible: true });
    await page.type('#username', USERNAME, { delay: 100 });
    
    log('パスワードを入力...');
    await page.waitForSelector('#value', { visible: true });
    await page.type('#value', PASSWORD, { delay: 100 });
    
    // ログインボタンをクリック
    log('ログインボタンをクリック...');
    await page.click('#submitDataverify');
    
    // ページ遷移を待機（タイムアウトエラーを避けるため、より柔軟に）
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
    } catch (navError) {
      log(`ナビゲーション待機でタイムアウト: ${navError.message}`);
      log('現在のページで続行します...');
      await wait(3000);
    }
    
    // ログイン後の警告メッセージのOKボタンをクリック
    try {
      await page.waitForSelector('#login_warn_confirm', { visible: true, timeout: 5000 });
      await page.click('#login_warn_confirm');
      log('ログイン警告メッセージのOKボタンをクリックしました');
      await wait(2000);
    } catch (e) {
      log('ログイン警告メッセージは表示されませんでした');
    }
    
    // ログイン後のスクリーンショット
    await page.screenshot({ path: '/tmp/nce_after_login.png' });
    log('ログイン後のスクリーンショット保存: /tmp/nce_after_login.png');
    
    // ログイン成功の確認
    const currentUrl = page.url();
    log(`現在のURL: ${currentUrl}`);
    
    log('✓ ログイン処理が正常に完了しました');
    
    // 少し待機（ページの読み込みを確実にする）
    await wait(2000);
    
    // ログアウト処理
    log('ログアウトを開始します...');
    
    // ユーザー名表示部分をクリックしてメニューを開く
    await page.waitForSelector('#banner_user_span', { visible: true });
    
    // 右上にスクロール
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    
    await page.click('#banner_user_span');
    log('ユーザー名をクリックしました');
    
    // メニューが表示されるのを十分に待つ
    await wait(5000);
    
    // フルページスクリーンショット
    await page.screenshot({ path: '/tmp/nce_menu_open.png', fullPage: true });
    log('メニュー表示後のスクリーンショット保存: /tmp/nce_menu_open.png');
    
    // DOMツリー全体を検索して、ログアウトリンクを探す
    let logoutClicked = false;
    try {
      const logoutElement = await page.evaluateHandle(() => {
        const logoutIconSvg = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMjRweCIgaGVpZ2h0PSIyNHB4IiB2aWV3Qm94PSIwIDAgMjQgMjQiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgICA8dGl0bGU+aWNfbG9nX291dF9saW5lZDwvdGl0bGU+CiAgICA8ZyBpZD0iaWNfbG9nX291dF9saW5lZCIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCI+CiAgICAgICAgPGcgaWQ9Iue8lue7hCI+CiAgICAgICAgICAgIDxyZWN0IGlkPSLnn6nlvaIiIGZpbGw9IiMyRTk0RkYiIG9wYWNpdHk9IjAiIHg9IjAiIHk9IjAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PC9yZWN0PgogICAgICAgICAgICA8cGF0aCBkPSJNMTUuNDUxMDE5NSwzIEMxNy4wNzUzMjg0LDMgMTguNDAzMDc0OCw0LjI2OTczNTMgMTguNDk1ODQyLDUuODcwNzg5MzMgTDE4LjUwMTAxOTUsNi4wNSBMMTguNTAxMDE5NSw2LjExOTc1MDk4IEMxOC41MDEwMTk1LDYuNTMzOTY0NTQgMTguMTY1MjMzMSw2Ljg2OTc1MDk4IDE3Ljc1MTAxOTUsNi44Njk3NTA5OCBDMTcuMzcxMzIzOCw2Ljg2OTc1MDk4IDE3LjA1NzUyODYsNi41ODc1OTcwOSAxNy4wMDc4NjYxLDYuMjIxNTIxNTMgTDE3LjAwMTAxOTUsNi4xMTk3NTA5OCBMMTcuMDAxMDE5NSw2LjA1IEMxNy4wMDEwMTk1LDUuMjQxNTE2NDkgMTYuMzgyMDI1Niw0LjU3NzYwNjc3IDE1LjU5MjEwMTEsNC41MDYzMzQzNCBMMTUuNDUxMDE5NSw0LjUgTDYuMDUxMDE5NTMsNC41IEM1LjI0MjUzNjAyLDQuNSA0LjU3ODYyNjMsNS4xMTg5OTM5NyA0LjUwNzM1Mzg3LDUuOTA4OTE4NDEgTDQuNTAxMDE5NTMsNi4wNSBMNC41MDEwMTk1MywxNy45NSBDNC41MDEwMTk1MywxOC43NTg0ODM1IDUuMTIwMDEzNSwxOS40MjIzOTMyIDUuOTA5OTM3OTQsMTkuNDkzNjY1NyBMNi4wNTEwMTk1MywxOS41IEwxNS40NTEwMTk1LDE5LjUgQzE2LjI1OTUwMywxOS41IDE2LjkyMzQxMjgsMTguODgxMDA2IDE2Ljk5NDY4NTIsMTguMDkxMDgxNiBMMTcuMDAxMDE5NSwxNy45MjA3NzY0IEMxNy4wMDEwMTk1LDE3LjUwNjU2MjggMTcuMzM2ODA2LDE3LjE3MDc3NjQgMTcuNzUxMDE5NSwxNy4xNzA3NzY0IEMxOC4xMzA3MTUzLDE3LjE3MDc3NjQgMTguNDQ0NTEwNSwxNy40NTI5MzAyIDE4LjQ5NDE3MjksMTcuODE5MDA1OCBMMTguNTAxMDE5NSwxNy45MjA3NzY0IEwxOC41MDEwMTk1LDE3Ljk1IEMxOC41MDEwMTk1LDE5LjU3NDMwODkgMTcuMjMxMjg0MiwyMC45MDIwNTUyIDE1LjYzMDIzMDIsMjAuOTk0ODIyNCBMMTUuNDUxMDE5NSwyMSBMNi4wNTEwMTk1MywyMSBDNC40MjY3MTA2MywyMSAzLjA5ODk2NDMsMTkuNzMwMjY0NyAzLjAwNjE5NzEsMTguMTI5MjEwNyBMMy4wMDEwMTk1MywxNy45NSBMMy4wMDEwMTk1Myw2LjA1IEMzLjAwMTAxOTUzLDQuNDI1NjkxMSA0LjI3MDc1NDgzLDMuMDk3OTQ0NzcgNS44NzE4MDg4NiwzLjAwNTE3NzU3IEw2LjA1MTAxOTUzLDMgTDE1LjQ1MTAxOTUsMyBaIE0xNy4wNjE2MDExLDguNjM1NzI5MjEgQzE3LjMyNDk4OTcsOC40NDY4NjIyNCAxNy42ODMyMDQxLDguNDQ5MjUyOTYgMTcuOTQ0MTkyMSw4LjY0MjkwMTM3IEwxNy45NDQxOTIxLDguNjQyOTAxMzcgTDE4LjAyODMxMDYsOC43MTU1MTk1MiBMMjAuNzc5MzEwNiwxMS40NjY1MTk1IEwyMC44NTkwOTE5LDExLjU2MDQ1NzggQzIxLjA0Nzk0MTQsMTEuODIzODExMSAyMS4wNDU1ODM3LDEyLjE4MTk3NDUgMjAuODUyMDAxNSwxMi40NDI5NjI4IEwyMC44NTIwMDE1LDEyLjQ0Mjk2MjggTDIwLjc3OTQwNjksMTIuNTI3MDgzMyBMMTguMDI4NDA2OSwxNS4yNzkwODMzIEwxNy45NDQzMDE3LDE1LjM1MTcxNjggQzE3LjY1MDcyOTgsMTUuNTY5NjI0NiAxNy4yMzQwNjE3LDE1LjU0NTQ5NDIgMTYuOTY3NzQ2OCwxNS4yNzkyNzYxIEMxNi43MDE0MzE4LDE1LjAxMzA1NzkgMTYuNjc3MTUwMSwxNC41OTYzOTg2IDE2Ljg5NDk1MTIsMTQuMzAyNzQ3NSBMMTYuODk0OTUxMiwxNC4zMDI3NDc1IEwxNi45Njc1NTQsMTQuMjE4NjE1OSBMMTguNDM4OTgwNSwxMi43NDU4NDk2IEwxMS43NTAzMzk4LDEyLjc0Njg0OTYgTDExLjY0ODU2OTMsMTIuNzQwMDAzIEMxMS4yODI0OTM3LDEyLjY5MDM0MDYgMTEuMDAwMzM5OCwxMi4zNzY1NDU0IDExLjAwMDMzOTgsMTEuOTk2ODQ5NiBDMTEuMDAwMzM5OCwxMS42MTcxNTM4IDExLjI4MjQ5MzcsMTEuMzAzMzU4NiAxMS42NDg1NjkzLDExLjI1MzY5NjIgTDExLjY0ODU2OTMsMTEuMjUzNjk2MiBMMTEuNzUwMzM5OCwxMS4yNDY4NDk2IEwxOC40Mzg5ODA1LDExLjI0NTg0OTYgTDE2Ljk2NzY1MDQsOS43NzYxNzk3IEwxNi44ODc4NjAxLDkuNjgyMjI5MDEgQzE2LjY5ODk5MzEsOS40MTg4NDAzNyAxNi43MDEzODM4LDkuMDYwNjI1OTUgMTYuODk1MDMyMiw4Ljc5OTYzNzk2IEwxNi44OTUwMzIyLDguNzk5NjM3OTYgTDE2Ljk2NzY1MDQsOC43MTU1MTk1MiBaIiBpZD0i5b2i54q257uT5ZCIIiBmaWxsPSIjMkU5NEZGIj48L3BhdGg+CiAgICAgICAgPC9nPgogICAgPC9nPgo8L3N2Zz4=';
        
        // アイコンを含むimg要素を探す
        const images = document.querySelectorAll('img');
        for (let img of images) {
          if (img.src === logoutIconSvg) {
            // imgの親要素、またはその上位要素でクリック可能なものを探す
            let parent = img.parentElement;
            let attempts = 0;
            while (parent && attempts < 5) {
              const text = parent.textContent?.trim();
              if (text && (text === 'Log out' || text.includes('Log out'))) {
                return parent;
              }
              parent = parent.parentElement;
              attempts++;
            }
          }
        }
        
        // アイコンが見つからない場合は、テキストで探す  
        const allElements = document.querySelectorAll('*');
        let logoutEl = null;
        
        for (let el of allElements) {
          const text = el.textContent || '';
          const trimmedText = text.trim();
          
          // "Log out"というテキストを持つ、子要素が少ない要素を探す
          if ((trimmedText === 'Log out' || trimmedText === 'LOG OUT' || trimmedText === 'Logout') 
              && el.children.length <= 1) {
            logoutEl = el;
            break;
          }
        }
        
        // 見つからない場合は、部分一致で探す
        if (!logoutEl) {
          for (let el of allElements) {
            const text = el.textContent || '';
            if (text.includes('Log out') && el.children.length <= 2) {
              logoutEl = el;
              break;
            }
          }
        }
        
        return logoutEl;
      });
      
      const asElement = logoutElement.asElement();
      if (asElement) {
        await asElement.click();
        logoutClicked = true;
        log('「Log Out」ボタンをクリックしました');
      } else {
        log('⚠ 「Log Out」要素が見つかりませんでした');
      }
    } catch (e) {
      log(`「Log Out」ボタンの検索に失敗: ${e.message}`);
    }
    
    if (logoutClicked) {
      // 確認ダイアログが表示されるのを待つ
      await wait(2000);
      
      // 確認ダイアログのスクリーンショット
      await page.screenshot({ path: '/tmp/nce_logout_dialog.png' });
      log('確認ダイアログのスクリーンショット保存: /tmp/nce_logout_dialog.png');
      
      // 「Yes」ボタンをクリック
      try {
        const yesButton = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button, .eui-btn-content-normal, [role="button"]'));
          return buttons.find(btn => {
            const text = btn.textContent?.trim();
            return text === 'Yes' || text === 'YES' || text === 'はい';
          });
        });
        
        const yesElement = yesButton.asElement();
        if (yesElement) {
          await yesElement.click();
          log('確認ダイアログで「Yes」をクリックしました');
          
          // ログアウト後のページ遷移を待機
          await wait(3000);
          
          // ログアウト後のスクリーンショット
          await page.screenshot({ path: '/tmp/nce_after_logout.png' });
          log('ログアウト後のスクリーンショット保存: /tmp/nce_after_logout.png');
          
          const logoutUrl = page.url();
          log(`ログアウト後のURL: ${logoutUrl}`);
          log('✓ ログアウト処理が正常に完了しました');
        } else {
          log('⚠ 「Yes」ボタンが見つかりませんでした');
        }
      } catch (e) {
        log(`「Yes」ボタンのクリックに失敗: ${e.message}`);
      }
    } else {
      log('⚠ 「Log Out」ボタンが見つかりませんでした');
      
      // デバッグ用: ページHTMLを保存
      const pageHtml = await page.content();
      const fs = require('fs');
      fs.writeFileSync('/tmp/nce_page_after_menu_click.html', pageHtml);
      log('デバッグ情報: /tmp/nce_menu_open.png と /tmp/nce_page_after_menu_click.html を確認してください');
    }
    
  } catch (error) {
    log(`✗ エラーが発生しました: ${error.message}`);
    
    // エラー時のスクリーンショット
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          await pages[0].screenshot({ path: '/tmp/nce_error.png' });
          log('エラー時のスクリーンショット保存: /tmp/nce_error.png');
        }
      } catch (screenshotError) {
        log(`スクリーンショット保存失敗: ${screenshotError.message}`);
      }
    }
    
    throw error;
    
  } finally {
    if (browser) {
      await browser.close();
      log('ブラウザを終了しました');
    }
  }
}

// スクリプト実行
autoLogin()
  .then(() => {
    log('処理完了');
    process.exit(0);
  })
  .catch((error) => {
    log(`処理失敗: ${error.message}`);
    process.exit(1);
  });
