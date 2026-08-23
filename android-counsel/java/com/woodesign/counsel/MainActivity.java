package com.woodesign.counsel;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 마음톡(AI 상담 대화)을 감싸는 WebView 셸.
 *
 * HTML/JS 는 APK 안 assets/ 에 있고, 인터넷은 Anthropic API 호출에만 쓴다.
 * 게임 셸과 달리 전체화면 몰입 모드를 쓰지 않는다 — 키보드가 올라오는 앱이라
 * 시스템 바를 그대로 두는 편이 입력에 안전하다.
 */
public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // API 키·대화 기록 저장(localStorage)
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setAllowFileAccess(true);
        // file:// 페이지에서 https API 를 호출해야 하므로 혼합 출처를 허용한다
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        web.setBackgroundColor(0xFFF4F2EE);

        // tel: 링크는 WebView 가 아니라 전화 앱으로 넘긴다 (상담 전화 연결)
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest req) {
                return handleUrl(req.getUrl().toString());
            }

            private boolean handleUrl(String url) {
                if (url == null) return false;
                if (url.startsWith("tel:") || url.startsWith("sms:") || url.startsWith("mailto:")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                        return true;
                    } catch (ActivityNotFoundException e) {
                        return true; // 전화 앱이 없는 기기에서 크래시하지 않게
                    }
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                        return true;
                    } catch (ActivityNotFoundException e) {
                        return true;
                    }
                }
                return false; // file:///android_asset/... 은 WebView 가 그대로 처리
            }
        });

        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    /** 뒤로가기로 앱이 즉시 닫히지 않게, 웹 히스토리를 먼저 소비한다. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
