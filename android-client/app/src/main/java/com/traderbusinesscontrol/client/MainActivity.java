package com.shopwatch.client;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);

        WebView w = new WebView(this);
        w.setWebViewClient(new WebViewClient());

        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        s.setTextZoom(100);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        w.setVerticalScrollBarEnabled(false);
        w.setHorizontalScrollBarEnabled(false);
        w.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        w.setBackgroundColor(0xFFF4F7F7);

        w.loadUrl("file:///android_asset/index.html");
        setContentView(w);
    }
}
