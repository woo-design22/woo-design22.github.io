package com.woodesign.sandmix;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * 샌드믹스(모래 퍼즐)를 감싸는 WebView 셸.
 *
 * HTML/JS 는 APK 안 assets/ 에 들어 있으므로 네트워크 없이 동작한다.
 * 캔버스 게임이라 하드웨어 가속과 전체화면 몰입 모드를 켜고,
 * BGM 이 Web Audio 로 합성되므로 미디어 자동재생 제한을 푼다.
 */
public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 플레이 중 화면이 꺼지지 않게 한다
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // 노치 영역까지 캔버스를 확장
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // 최고 기록·설정 저장(localStorage)
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setAllowFileAccess(true);
        // Web Audio BGM 이 시작 버튼 터치 직후 바로 울리도록
        s.setMediaPlaybackRequiresUserGesture(false);

        web.setBackgroundColor(0xFF0D0D16);
        // 조각을 손가락으로 끌 때 WebView 가 스크롤을 가로채지 않도록
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

    @Override
    protected void onPause() {
        super.onPause();
        // 홈으로 나가면 JS 타이머·오디오를 멈춘다 (페이지의 visibilitychange 가 게임을 일시정지한다)
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    /** 상태바·내비게이션바를 숨겨 보드를 화면 전체로 쓴다. 가장자리를 쓸면 잠시 나타난다. */
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
}
