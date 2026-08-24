package com.woodesign.particle;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * 파티클 플레이그라운드를 감싸는 WebView 셸.
 *
 * HTML/JS/아이콘은 APK 안 assets/ 에 들어 있으므로 네트워크 없이 동작한다.
 * 캔버스 드로잉 앱이라 하드웨어 가속과 전체화면 몰입 모드를 켠다.
 */
public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 그리는 도중 화면이 꺼지지 않게 한다
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // 노치 영역까지 캔버스를 확장 (CSS의 safe-area-inset 과 짝을 이룬다)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // 화면 폭에 맞춰 축소하는 기본 동작을 끄고, HTML의 viewport 설정을 그대로 따르게 한다
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setAllowFileAccess(true);

        web.setBackgroundColor(0xFF05050A);
        // 캔버스를 손가락으로 끌 때 WebView가 스크롤을 가로채지 않도록
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);

        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** 상태바·내비게이션바를 숨겨 캔버스를 화면 전체로 쓴다. 가장자리를 쓸면 잠시 나타난다. */
    private void hideSystemBars() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
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
