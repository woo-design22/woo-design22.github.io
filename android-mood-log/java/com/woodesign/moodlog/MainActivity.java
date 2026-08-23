package com.woodesign.moodlog;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 기분·수면 일지를 감싸는 WebView 셸.
 *
 * HTML/JS는 APK 안 assets/index.html 이고, 기록은 WebView의 localStorage(DOM storage)에
 * 남는다. 네트워크 권한이 없으므로 데이터가 기기 밖으로 나가지 않는다.
 *
 * 웹에서 브라우저가 해 주던 세 가지를 여기서 대신한다 (index.html 의 window.AndroidBridge):
 *   saveFile  - JSON 내보내기. 시스템 문서 선택기로 저장 위치를 고르게 한다 (SAF, 권한 불필요)
 *   copyText  - 진료용 텍스트를 클립보드로
 *   print     - 시스템 인쇄 대화상자 (PDF로 저장 가능)
 * JSON 가져오기는 &lt;input type=file&gt; 을 onShowFileChooser 로 받아 문서 선택기를 연다.
 */
public class MainActivity extends Activity {

    private static final int REQ_SAVE = 1;
    private static final int REQ_OPEN = 2;

    private WebView web;
    private String pendingSaveContent;               // saveFile 에서 받아 두었다가 onActivityResult 에서 쓴다
    private ValueCallback<Uri[]> pendingFileChooser; // onShowFileChooser 콜백

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // localStorage — 기록 저장에 필수
        s.setAllowFileAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        // 시스템 글꼴 크기 설정을 그대로 따른다 (접근성)
        s.setTextZoom(100);

        web.setBackgroundColor(0xFF14141F);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                // JSON 의 MIME 판정이 기기마다 달라서(application/json, text/plain, octet-stream) 전부 허용
                intent.setType("*/*");
                try {
                    startActivityForResult(intent, REQ_OPEN);
                } catch (Exception e) {
                    pendingFileChooser = null;
                    Toast.makeText(MainActivity.this, "파일 선택기를 열 수 없다", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
    }

    /** index.html 이 window.AndroidBridge 로 부르는 함수들. 백그라운드 스레드에서 호출된다. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(final String name, final String content) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    pendingSaveContent = content;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(intent, REQ_SAVE);
                    } catch (Exception e) {
                        pendingSaveContent = null;
                        Toast.makeText(MainActivity.this, "저장 대화상자를 열 수 없다", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void copyText(final String text) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("mood-log", text));
                }
            });
        }

        @JavascriptInterface
        public void print() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    if (pm == null) return;
                    String job = "기분 일지";
                    PrintDocumentAdapter adapter = web.createPrintDocumentAdapter(job);
                    pm.print(job, adapter, new PrintAttributes.Builder().build());
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SAVE) {
            String content = pendingSaveContent;
            pendingSaveContent = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try {
                OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt");
                if (out == null) throw new IllegalStateException("no stream");
                try {
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                } finally {
                    out.close();
                }
                Toast.makeText(this, "저장됨", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "저장 실패: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        } else if (requestCode == REQ_OPEN) {
            if (pendingFileChooser == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[] { data.getData() };
            }
            pendingFileChooser.onReceiveValue(result);
            pendingFileChooser = null;
        }
    }

    /** 뒤로가기: 웹 히스토리가 있으면 그쪽을 먼저 처리한다. */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
