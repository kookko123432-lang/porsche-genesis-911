package com.porsche.genesis911;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.util.Log;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String TAG = "Genesis911";
    private static final int REQ_RECORD_AUDIO = 911;

    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private PermissionRequest pendingMicRequest;
    private boolean pendingNativeVoiceRecord = false;
    private MediaRecorder voiceRecorder;
    private MediaPlayer voicePlayer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#0A0B0D"));
        window.setNavigationBarColor(Color.parseColor("#0A0B0D"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0A0B0D"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> handleWebPermission(request));
            }
        });
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        initTts();
        setContentView(webView);
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    // ---------------------------------------------------------------------
    // Microphone: grant the WebView request only after the OS permission
    // ---------------------------------------------------------------------
    private void handleWebPermission(PermissionRequest request) {
        boolean wantsMic = false;
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
        }
        if (!wantsMic) {
            request.deny();
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pendingMicRequest = request;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_RECORD_AUDIO) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingMicRequest != null) {
            if (granted) {
                pendingMicRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pendingMicRequest.deny();
            }
            pendingMicRequest = null;
        }
        if (pendingNativeVoiceRecord) {
            pendingNativeVoiceRecord = false;
            if (granted) {
                boolean ok = startVoiceRecordInternal();
                notifyVoiceState(ok ? "RECORDING" : "ERROR");
            } else {
                notifyVoiceState("DENIED");
            }
        }
    }

    private File getVoiceFile() {
        return new File(getFilesDir(), "self_voice.m4a");
    }

    private void notifyVoiceState(String status) {
        if (webView == null) return;
        final String js = "window.__onNativeVoiceState && window.__onNativeVoiceState(" + JSONObject.quote(status) + ")";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private synchronized boolean startVoiceRecordInternal() {
        stopVoiceLoopInternal();
        stopVoiceRecordInternal();
        try {
            File out = getVoiceFile();
            if (out.exists()) out.delete();
            voiceRecorder = new MediaRecorder();
            voiceRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            voiceRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            voiceRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            voiceRecorder.setAudioEncodingBitRate(128000);
            voiceRecorder.setAudioSamplingRate(44100);
            voiceRecorder.setOutputFile(out.getAbsolutePath());
            voiceRecorder.prepare();
            voiceRecorder.start();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "startVoiceRecordInternal failed", e);
            stopVoiceRecordInternal();
            return false;
        }
    }

    private synchronized boolean stopVoiceRecordInternal() {
        if (voiceRecorder == null) return false;
        boolean ok = false;
        try {
            voiceRecorder.stop();
            ok = true;
        } catch (Exception e) {
            Log.w(TAG, "stopVoiceRecordInternal warning", e);
        } finally {
            try { voiceRecorder.release(); } catch (Exception ignored) { }
            voiceRecorder = null;
        }
        File f = getVoiceFile();
        return ok && f.exists() && f.length() > 256;
    }

    private synchronized String toggleVoiceLoopInternal() {
        if (voicePlayer != null) {
            stopVoiceLoopInternal();
            return "STOPPED";
        }
        File f = getVoiceFile();
        if (!f.exists() || f.length() <= 256) return "EMPTY";
        try {
            voicePlayer = new MediaPlayer();
            voicePlayer.setDataSource(f.getAbsolutePath());
            voicePlayer.setLooping(true);
            voicePlayer.prepare();
            voicePlayer.start();
            return "LOOPING";
        } catch (Exception e) {
            Log.e(TAG, "toggleVoiceLoopInternal failed", e);
            stopVoiceLoopInternal();
            return "ERROR";
        }
    }

    private synchronized void stopVoiceLoopInternal() {
        if (voicePlayer == null) return;
        try {
            if (voicePlayer.isPlaying()) voicePlayer.stop();
        } catch (Exception ignored) { }
        try {
            voicePlayer.release();
        } catch (Exception ignored) { }
        voicePlayer = null;
    }

    // ---------------------------------------------------------------------
    // Native text-to-speech (WebView has no reliable speechSynthesis)
    // ---------------------------------------------------------------------
    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) {
                Log.w(TAG, "TTS init failed: " + status);
                return;
            }
            int res = tts.setLanguage(Locale.TRADITIONAL_CHINESE);
            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                res = tts.setLanguage(Locale.CHINESE);
            }
            ttsReady = res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED;
            if (!ttsReady) Log.w(TAG, "No Chinese TTS voice installed");
            tts.setPitch(0.95f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { notifyDone(id); }
                @Override public void onError(String id) { notifyDone(id); }
            });
        });
    }

    private void notifyDone(String id) {
        if (webView == null) return;
        final String js = "window.genesisAudio && window.genesisAudio._nativeDone(" + JSONObject.quote(id) + ")";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private class Bridge {
        @JavascriptInterface
        public void speak(String text, String rate, String id) {
            if (tts == null || !ttsReady) {
                notifyDone(id); // let the caller continue (subtitle-only)
                return;
            }
            float r = 0.9f;
            try { r = Float.parseFloat(rate); } catch (NumberFormatException ignored) { }
            tts.setSpeechRate(r);
            int res = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
            if (res != TextToSpeech.SUCCESS) {
                notifyDone(id);
            }
        }

        @JavascriptInterface
        public void stopSpeaking() {
            if (tts != null) tts.stop();
        }

        @JavascriptInterface
        public boolean hasVoiceRecord() {
            File f = getVoiceFile();
            return f.exists() && f.length() > 256;
        }

        @JavascriptInterface
        public String startVoiceRecord() {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                pendingNativeVoiceRecord = true;
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO));
                return "PERMISSION";
            }
            return startVoiceRecordInternal() ? "RECORDING" : "ERROR";
        }

        @JavascriptInterface
        public boolean stopVoiceRecord() {
            return stopVoiceRecordInternal();
        }

        @JavascriptInterface
        public String toggleVoiceLoop() {
            return toggleVoiceLoopInternal();
        }

        @JavascriptInterface
        public boolean saveImage(String base64, String filename) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Porsche911");
                    ContentResolver resolver = getContentResolver();
                    Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return false;
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) return false;
                        out.write(bytes);
                    }
                } else {
                    File dir = new File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "Porsche911");
                    if (!dir.exists() && !dir.mkdirs()) return false;
                    File file = new File(dir, filename);
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(bytes);
                    }
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{file.getAbsolutePath()}, new String[]{"image/png"}, null);
                }
                return true;
            } catch (Exception e) {
                Log.e(TAG, "saveImage failed", e);
                return false;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------
    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        PorscheWidgetProvider.refreshAll(this); // keep the home-screen widget's day count current
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        stopVoiceRecordInternal();
        stopVoiceLoopInternal();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    // Back: let the web app close modals / return to Chrono first
    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("(window.__onBack && window.__onBack()) ? '1' : '0'", value -> {
            if (!"\"1\"".equals(value)) {
                MainActivity.super.onBackPressed();
            }
        });
    }
}
