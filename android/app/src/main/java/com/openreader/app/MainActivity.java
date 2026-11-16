package com.openreader.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Full 开放书库 in a WebView.
 * The whole desktop core runs in JS from assets; this class only supplies
 * a virtual https origin, file picking, exports and external-link handling.
 */
public class MainActivity extends Activity {

    private static final String LOCAL_HOST = "openreader.local";
    private static final String BASE = "https://" + LOCAL_HOST + "/";
    private static final String REMOTE_HOST = "soshu.pythonanywhere.com";
    private static final int REQ_FILE = 1001;
    private static final int REQ_SAVE = 1002;
    private static final String PENDING_BACKUP = "pending-backup.bin";

    // ---- in-app update (free, self-hosted on the existing PythonAnywhere site) ----
    // Address is fixed; version/sha256/notes always come from update.json, never hardcoded.
    private static final String UPDATE_URL = "https://soshu.pythonanywhere.com/or/update.json";
    private static final String APK_URI = "content://com.openreader.app.apkprovider/" + ApkProvider.APK_NAME;

    // Anonymous usage statistics. Only a random UUID, app version, model and
    // Android version are sent; no book, file name, path or library content.
    private static final String PING_URL = "https://soshu.pythonanywhere.com/or/ping";
    private static final String PREF_NAME = "openreader";
    private static final long PING_INTERVAL_MS = 12L * 60L * 60L * 1000L;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private long lastBackAt = 0L;
    private volatile boolean updating = false;
    private boolean pendingInstall = false;

    // Mandatory startup update gate (see startupUpdateCheck below).
    private volatile boolean forceUpdate = false;
    private boolean gateShown = false;
    private AlertDialog gateDialog = null;
    private String fuName = "", fuNotes = "", fuUrl = "", fuSha = "";

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setTheme(android.R.style.Theme_Material_Light_NoActionBar);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        // L2: record (never block) a signature mismatch. Blocking here bricked
        // legitimate in-app upgrades on some ROMs, so keep it log-only.
        if (Integrity.enabled() && !signatureMatches()) {
            Log.w("OpenReader", "signature fingerprint mismatch (recorded only)");
        }

        // 真机可用 chrome://inspect 直接看 WebView 控制台，便于定位老引擎兼容问题。
        WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        setContentView(web);
        applySystemBarStyle("light");

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // library lives in IndexedDB / localStorage
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        // 部分厂商文件管理器返回 content:// Uri；关掉 content access 会让选书失败。
        s.setAllowContentAccess(true);
        s.setSupportMultipleWindows(true);     // 云书库 result cards use target="_blank"
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setBuiltInZoomControls(false);
        // 关掉双击缩放：否则正文双击会被 WebView 当成缩放手势吞掉，
        // click 不派发，阅读器的「双击进入全屏」就永远收不到第二次点击。
        s.setSupportZoom(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);                    // 不跟随系统「字体大小」，避免顶栏/底栏被撑爆
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // MIUI / EMUI / ColorOS 的「强制深色」会把 WebView 整个反色，这里交给我们自己的主题。
        if (Build.VERSION.SDK_INT >= 29) {
            s.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new NativeBridge(), "AndroidNative");
        web.setWebViewClient(new LocalClient());
        web.setWebChromeClient(new LocalChrome());
        web.loadUrl(BASE + "index.html");
        // Cold-start mandatory update check. It never blocks on network errors.
        startupUpdateCheck();
        // Anonymous usage ping: opt-out, throttled and always best-effort.
        pingUsage();
        // Background asset hash check; log-only, never shows a dialog or toast.
        verifyAssets();
    }

    // ---------- virtual https origin backed by APK assets ----------
    private WebResourceResponse localAsset(String urlPath) {
        String rel = urlPath == null ? "" : urlPath.replaceFirst("^/+", "");
        if (rel.isEmpty() || rel.endsWith("/")) rel = rel + "index.html";
        if (rel.contains("..")) return notFound();
        try {
            InputStream in = getAssets().open(rel);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-store");
            h.put("Access-Control-Allow-Origin", "*");
            return new WebResourceResponse(mimeOf(rel), "UTF-8", 200, "OK", h, in);
        } catch (Exception e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", h,
                new ByteArrayInputStream("Not found".getBytes()));
    }

    private String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".mjs") || n.endsWith(".js")) return "text/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private final class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (LOCAL_HOST.equalsIgnoreCase(u.getHost())) return localAsset(u.getPath());
            return null;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (LOCAL_HOST.equalsIgnoreCase(u.getHost())) return false;
            if ("https".equalsIgnoreCase(u.getScheme())
                    && REMOTE_HOST.equalsIgnoreCase(u.getHost())) return false;
            openOutside(u.toString());
            return true;
        }
    }

    private final class LocalChrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                         FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = cb;
            // 「从备份恢复」：把系统文件选择器直接定位到上次备份所在位置。
            if (isBackupPicker(params)) {
                Intent pick = backupPickerIntent();
                if (pick != null) {
                    try {
                        startActivityForResult(Intent.createChooser(pick, "选择备份文件"), REQ_FILE);
                        return true;
                    } catch (Exception ignored) { }
                    try {
                        startActivityForResult(pick, REQ_FILE);
                        return true;
                    } catch (Exception ignored) { }
                }
            }
            Intent base = null;
            try { base = params.createIntent(); } catch (Exception ignored) { }
            if (base != null) {
                // 华为「我的文件」、小米「文件管理」等定制选择器对裸 Intent 支持不一，
                // 先走 chooser，失败再退回原始 Intent，两者都不行才报错。
                try {
                    startActivityForResult(Intent.createChooser(base, "选择书籍文件"), REQ_FILE);
                    return true;
                } catch (Exception ignored) { }
                try {
                    startActivityForResult(base, REQ_FILE);
                    return true;
                } catch (Exception ignored) { }
            }
            filePathCallback = null;
            showToast("无法打开文件选择器");
            return false;
        }

        @Override
        public boolean onCreateWindow(WebView v, boolean isDialog,
                                      boolean isUserGesture, Message resultMsg) {
            WebView popup = new WebView(MainActivity.this);
            popup.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView p, WebResourceRequest req) {
                    openOutside(req.getUrl().toString());
                    return true;
                }
            });
            WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
            t.setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }
    }

    /* ---------------------------------------------------------------------
       Whole-library backup. ACTION_CREATE_DOCUMENT lets the user pick any
       visible folder AND edit the file name in the system save dialog; the
       resulting URI is remembered so "restore" opens right back there.
       Android does not allow arbitrary text paths (scoped storage), so a
       system picker is the only reliable "custom path" on this platform.
       --------------------------------------------------------------------- */
    private boolean isBackupPicker(WebChromeClient.FileChooserParams params) {
        try {
            String[] types = params.getAcceptTypes();
            if (types == null) return false;
            for (String t : types) {
                if (t != null && t.toLowerCase().contains("openlib")) return true;
            }
        } catch (Exception ignored) { }
        return false;
    }

    private Intent backupPickerIntent() {
        if (Build.VERSION.SDK_INT < 26) return null;
        String last = prefs().getString("last_backup_uri", null);
        if (last == null || last.length() == 0) return null;
        try {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES,
                    new String[]{"application/zip", "application/octet-stream", "*/*"});
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(last));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            return i;
        } catch (Exception e) {
            return null;
        }
    }

    private String safeBackupName(String name) {
        String s = (name == null ? "" : name.trim())
                .replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_");
        if (s.length() == 0) s = "开放书库备份.openlib";
        String low = s.toLowerCase();
        if (!low.endsWith(".openlib") && !low.endsWith(".zip")) s = s + ".openlib";
        if (s.length() > 120) s = s.substring(0, 120) + ".openlib";
        return s;
    }

    private String backupDisplayName(Uri uri, String fallback) {
        android.database.Cursor c = null;
        try {
            c = getContentResolver().query(uri, null, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (i >= 0) {
                    String s = c.getString(i);
                    if (s != null && s.length() > 0) return s;
                }
            }
        } catch (Exception ignored) { }
        finally {
            if (c != null) {
                try { c.close(); } catch (Exception ignored) { }
            }
        }
        return fallback;
    }

    private void onSaveBackupResult(int res, Intent data) {
        File tmp = new File(getCacheDir(), PENDING_BACKUP);
        String name = prefs().getString("pending_backup_name", "开放书库备份.openlib");
        if (res != RESULT_OK || data == null || data.getData() == null) {
            if (tmp.exists()) tmp.delete();
            showToast("已取消备份");
            return;
        }
        Uri uri = data.getData();
        try {
            int take = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (take != 0) getContentResolver().takePersistableUriPermission(uri, take);
        } catch (Exception ignored) { }
        try {
            OutputStream os = getContentResolver().openOutputStream(uri);
            if (os == null) throw new Exception("无法写入所选位置");
            FileInputStream in = new FileInputStream(tmp);
            try {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            } finally {
                in.close();
                os.close();
            }
            String label = backupDisplayName(uri, name);
            prefs().edit().putString("last_backup_uri", uri.toString())
                    .putString("last_backup_name", label)
                    .remove("pending_backup_name").apply();
            showToast("备份完成：" + label + "\n恢复时会自动打开这个位置");
        } catch (Exception e) {
            showToast("保存失败：" + e.getMessage());
        } finally {
            if (tmp.exists()) tmp.delete();
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_SAVE) { onSaveBackupResult(res, data); return; }
        if (req != REQ_FILE) {
            super.onActivityResult(req, res, data);
            return;
        }
        ValueCallback<Uri[]> cb = filePathCallback;
        filePathCallback = null;
        if (cb == null) return;
        Uri[] results = null;
        if (res == RESULT_OK && data != null) {
            if (data.getDataString() != null) {
                results = new Uri[] { Uri.parse(data.getDataString()) };
            } else if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                results = new Uri[n];
                for (int i = 0; i < n; i++) {
                    results[i] = data.getClipData().getItemAt(i).getUri();
                }
            }
        }
        cb.onReceiveValue(results);
    }

    private void openOutside(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            showToast("没有可打开该链接的应用");
        }
    }

    private void showToast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
            }
        });
    }

    /* ---------------------------------------------------------------------
       L2 tamper checks. Android already verifies the APK signature against
       the installed certificate; here we compare it with the fingerprint
       recorded at build time. Both checks are LOG-ONLY: blocking or popping a
       dialog produced false positives right after legitimate in-app upgrades.
       A read failure or a false positive must never brick an offline library.
       --------------------------------------------------------------------- */
    private Signature[] ownSignatures() {
        // API 28+ exposes the certificate that was actually used to verify the
        // installed APK; GET_SIGNATURES is deprecated and differs across ROMs.
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(),
                        PackageManager.GET_SIGNING_CERTIFICATES);
                if (pi.signingInfo != null) {
                    Signature[] s = pi.signingInfo.getApkContentsSigners();
                    if (s != null && s.length > 0) return s;
                }
            } catch (Throwable t) {
                Log.w("OpenReader", "GET_SIGNING_CERTIFICATES failed", t);
            }
        }
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(),
                    PackageManager.GET_SIGNATURES);
            if (pi.signatures != null && pi.signatures.length > 0) return pi.signatures;
        } catch (Exception e) {
            Log.w("OpenReader", "GET_SIGNATURES failed", e);
        }
        return null;
    }

    private boolean signatureMatches() {
        Signature[] sigs = ownSignatures();
        // Some ROMs may fail to expose signatures. A re-signed package always
        // has readable signatures, so failing open here only loses detection
        // on exotic devices; it never bricks a legitimate installation.
        if (sigs == null || sigs.length == 0) return true;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (Signature s : sigs) {
                if (Integrity.SIGNATURE_SHA256.equalsIgnoreCase(
                        hex(md.digest(s.toByteArray())))) return true;
            }
        } catch (Exception e) {
            Log.w("OpenReader", "signature digest failed", e);
        }
        return false;
    }

    private void verifyAssets() {
        if (!Integrity.enabled() || "DEV".equals(Integrity.ASSET_HASHES)) return;
        new Thread(new Runnable() {
            @Override public void run() {
                String bad = null;
                ZipFile zip = null;
                try {
                    zip = new ZipFile(getApplicationInfo().sourceDir);
                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                    for (String item : Integrity.ASSET_HASHES.split(";")) {
                        int p = item.lastIndexOf(':');
                        if (p < 0) continue;
                        String name = item.substring(0, p);
                        String want = item.substring(p + 1);
                        ZipEntry e = zip.getEntry(name);
                        if (e == null) { bad = name; break; }
                        InputStream in = zip.getInputStream(e);
                        try {
                            byte[] buf = new byte[8192];
                            int n;
                            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
                        } finally { in.close(); }
                        if (!want.equals(hex(md.digest()))) { bad = name; break; }
                    }
                } catch (Exception e) {
                    Log.w("OpenReader", "asset check skipped", e);
                    return;
                } finally {
                    if (zip != null) { try { zip.close(); } catch (Exception ignored) {} }
                }
                if (bad != null) {
                    // Log only: a normal in-app upgrade must never show a
                    // "tampered / reinstall" message to the user.
                    Log.w("OpenReader", "asset hash mismatch (recorded only): " + bad);
                }
            }
        }).start();
    }

    /* =====================================================================
       In-app update.  Free, self-hosted: GET /or/update.json on the existing
       PythonAnywhere site, download the APK into the app-private files dir,
       verify its SHA-256, then hand a content:// URI to the system installer.
       No third-party SDK, no storage permission. The update check itself sends
       no device id; the separate anonymous usage ping is opt-out in Settings.
       ===================================================================== */

    /* ---------------------------------------------------------------------
       Mandatory startup update gate.
       Every cold start fetches the manifest. If a newer build is published
       with force=true, reading is blocked behind a non-cancellable dialog
       until the APK is installed. Network failure, expired free hosting,
       placeholder or malformed manifest NEVER block the app: a dead update
       host must not brick an otherwise fully offline library.
       --------------------------------------------------------------------- */
    private void startupUpdateCheck() {
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    final JSONObject j = new JSONObject(httpGet(UPDATE_URL, 8000));
                    final int remote = j.optInt("code", 0);
                    final boolean force = j.optBoolean("force", true);
                    final String url = j.optString("url", "");
                    final String sha = j.optString("sha256", "");
                    // Placeholder manifest / missing APK / bad URL -> let the user read.
                    if (!force || remote <= currentVersionCode()) return;
                    if (!url.startsWith("https://") || sha.length() < 64) return;
                    final String name = j.optString("name", "");
                    final String notes = j.optString("notes", "");
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            fuName = name; fuNotes = notes; fuUrl = url; fuSha = sha;
                            forceUpdate = true;
                            showForceGate();
                        }
                    });
                } catch (Exception e) {
                    Log.i("OpenReader", "startup update check skipped: " + e.getMessage());
                }
            }
        }, "or-startup-update").start();
    }

    private void showForceGate() {
        if (isFinishing() || gateShown) return;
        gateShown = true;
        if (web != null) {
            web.setEnabled(false);       // no reading / no importing behind the dialog
            web.setClickable(false);
        }
        String msg = "发现新版本 " + fuName;
        if (fuNotes.length() > 0) msg += "\n\n" + fuNotes;
        msg += "\n\n覆盖安装不会清空本地书库。";
        AlertDialog.Builder b = new AlertDialog.Builder(this);
        b.setTitle("开放书库需要更新");
        b.setMessage(msg);
        b.setCancelable(false);
        b.setPositiveButton("立即更新", new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface d, int which) {
                startForceDownload();
            }
        });
        b.setNegativeButton("退出应用", new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface d, int which) {
                finishAffinity();
            }
        });
        AlertDialog dlg = b.create();
        dlg.setCanceledOnTouchOutside(false);
        dlg.setOnKeyListener(new DialogInterface.OnKeyListener() {
            @Override public boolean onKey(DialogInterface d, int keyCode, KeyEvent event) {
                // Back must not dismiss the gate; leaving the app is allowed,
                // reopening simply checks again.
                if (keyCode == KeyEvent.KEYCODE_BACK
                        && event.getAction() == KeyEvent.ACTION_UP) {
                    finishAffinity();
                    return true;
                }
                return false;
            }
        });
        dlg.show();
        gateDialog = dlg;
    }

    private void startForceDownload() {
        if (updating) return;
        updating = true;
        showToast("正在下载更新，请稍候…");
        if (gateDialog != null) {
            gateDialog.getButton(DialogInterface.BUTTON_POSITIVE).setEnabled(false);
        }
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    File dir = apkFile().getParentFile();
                    if (dir != null && !dir.isDirectory() && !dir.mkdirs())
                        throw new Exception("无法创建下载目录");
                    File f = apkFile();
                    if (f.exists() && !f.delete()) throw new Exception("无法清理旧安装包");
                    String got = httpDownload(fuUrl, f);
                    if (!fuSha.equalsIgnoreCase(got)) {
                        if (f.exists()) f.delete();
                        throw new Exception("安装包校验失败");
                    }
                    installIfAllowed();   // guides the user through "unknown sources"
                } catch (Exception e) {
                    Log.i("OpenReader", "force update download: " + e.getMessage());
                    showToast("下载失败：" + e.getMessage() + "，请点「立即更新」重试");
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            if (gateDialog != null) {
                                gateDialog.getButton(DialogInterface.BUTTON_POSITIVE)
                                        .setEnabled(true);
                            }
                        }
                    });
                } finally {
                    updating = false;
                }
            }
        }, "or-force-download").start();
    }

    /** JSON is a strict subset of JS object literals, so pass it unwrapped. */
    private void jsCallback(final String json) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (web == null) return;
                web.evaluateJavascript(
                    "(function(){try{return window.__orUpdateResult(" + json
                        + ");}catch(e){return 'no-handler';}})()", null);
            }
        });
    }

    private String state(String s, String msg) {
        try {
            return new JSONObject().put("state", s).put("manual", true)
                    .put("message", msg == null ? "" : msg).toString();
        } catch (Exception e) {
            return "{\"state\":\"error\",\"manual\":true,\"message\":\"\"}";
        }
    }

    /* ---------- 匿名使用统计（设置里可关闭） ---------- */
    private SharedPreferences prefs() {
        return getSharedPreferences(PREF_NAME, MODE_PRIVATE);
    }

    private String deviceId() {
        SharedPreferences p = prefs();
        String id = p.getString("device_id", "");
        if (id == null || !id.matches(
                "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")) {
            id = java.util.UUID.randomUUID().toString();
            p.edit().putString("device_id", id).apply();
        }
        return id;
    }

    /** 冷启动与回到前台各查一次，12 小时节流；任何失败都静默，不影响阅读。 */
    private void pingUsage() {
        try {
            SharedPreferences p = prefs();
            if (!p.getBoolean("stats_opt_in", true)) return;
            long now = System.currentTimeMillis();
            if (now - p.getLong("last_ping", 0L) < PING_INTERVAL_MS) return;
            p.edit().putLong("last_ping", now).apply();
            final JSONObject body = new JSONObject();
            body.put("device_id", deviceId());
            body.put("version", String.valueOf(currentVersionCode()));
            body.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            body.put("android", Build.VERSION.RELEASE);
            new Thread(new Runnable() {
                @Override public void run() {
                    try {
                        httpPostJson(PING_URL, body.toString(), 8000);
                    } catch (Exception e) {
                        Log.i("OpenReader", "usage ping skipped: " + e.getMessage());
                    }
                }
            }, "or-usage-ping").start();
        } catch (Exception e) {
            Log.i("OpenReader", "usage ping skipped: " + e.getMessage());
        }
    }

    private void httpPostJson(String urlStr, String body, int timeout) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
        c.setConnectTimeout(timeout);
        c.setReadTimeout(timeout);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        c.setRequestProperty("Accept", "application/json");
        try {
            OutputStream out = c.getOutputStream();
            try {
                out.write(body.getBytes("UTF-8"));
                out.flush();
            } finally {
                out.close();
            }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
        } finally {
            c.disconnect();
        }
    }

    private int currentVersionCode() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private String httpGet(String urlStr, int timeout) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
        c.setConnectTimeout(timeout);
        c.setReadTimeout(timeout);
        c.setRequestMethod("GET");
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } finally {
                in.close();
            }
            String s = new String(out.toByteArray(), "UTF-8");
            // 用户手工编辑过的 JSON 可能带 BOM，JSONObject 不接受开头的 U+FEFF。
            if (s.length() > 0 && s.charAt(0) == '\uFEFF') s = s.substring(1);
            return s;
        } finally {
            c.disconnect();
        }
    }

    /** Streams the APK to disk while hashing it; returns lowercase hex SHA-256. */
    private String httpDownload(String urlStr, File dst) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestMethod("GET");
        c.setInstanceFollowRedirects(true);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            FileOutputStream out = new FileOutputStream(dst);
            try {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    md.update(buf, 0, n);
                }
                out.flush();
            } finally {
                out.close();
                in.close();
            }
            return hex(md.digest());
        } finally {
            c.disconnect();
        }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) {
            String h = Integer.toHexString(x & 0xff);
            if (h.length() == 1) sb.append('0');
            sb.append(h);
        }
        return sb.toString();
    }

    private boolean canInstall() {
        if (Build.VERSION.SDK_INT < 26) return true;
        try {
            return getPackageManager().canRequestPackageInstalls();
        } catch (Exception e) {
            return false;
        }
    }

    private File apkFile() {
        return new File(new File(getFilesDir(), "apk"), ApkProvider.APK_NAME);
    }

    private void runCheckUpdate(final boolean manual) {
        if (updating) return;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject j = new JSONObject(httpGet(UPDATE_URL, 8000));
                    int remote = j.optInt("code", 0);
                    JSONObject out = new JSONObject();
                    out.put("manual", manual);
                    if (remote > currentVersionCode()) {
                        out.put("state", "available");
                        out.put("code", remote);
                        out.put("name", j.optString("name", ""));
                        out.put("notes", j.optString("notes", ""));
                        out.put("url", j.optString("url", ""));
                        out.put("sha256", j.optString("sha256", ""));
                    } else {
                        out.put("state", "latest");
                    }
                    jsCallback(out.toString());
                } catch (Exception e) {
                    // 站点休眠 / 无网络 / 清单损坏：静默失败，绝不打断阅读，只写 logcat。
                    Log.i("OpenReader", "update check: " + e.getMessage());
                    jsCallback(stateSilent(manual));
                }
            }
        }, "or-update-check").start();
    }

    private String stateSilent(boolean manual) {
        try {
            return new JSONObject().put("state", "error").put("manual", manual)
                    .put("message", "检查更新失败").toString();
        } catch (Exception e) {
            return "{\"state\":\"error\",\"manual\":false}";
        }
    }

    private void runDownloadAndInstall(final String url, final String sha256) {
        if (updating) return;
        updating = true;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    if (url == null || !url.startsWith("https://")) {
                        throw new Exception("下载地址必须是 https");
                    }
                    File dir = apkFile().getParentFile();
                    if (dir != null && !dir.isDirectory() && !dir.mkdirs()) {
                        throw new Exception("无法创建下载目录");
                    }
                    File f = apkFile();
                    if (f.exists() && !f.delete()) throw new Exception("无法清理旧安装包");
                    String got = httpDownload(url, f);
                    if (sha256 == null || sha256.length() < 64
                            || !sha256.equalsIgnoreCase(got)) {
                        if (f.exists()) f.delete();
                        jsCallback(state("error", "安装包校验失败，已删除，请稍后重试"));
                        return;
                    }
                    jsCallback(state("downloaded", ""));
                    installIfAllowed();
                } catch (Exception e) {
                    Log.i("OpenReader", "update download: " + e.getMessage());
                    jsCallback(state("error", "下载失败，请检查网络后重试"));
                } finally {
                    updating = false;
                }
            }
        }, "or-update-download").start();
    }

    private void installIfAllowed() {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (!canInstall()) {
                    pendingInstall = true;
                    jsCallback(state("need-permission", ""));
                    try {
                        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getPackageName()));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    } catch (Exception e) {
                        showToast("请在设置里允许「安装未知应用」后重试");
                    }
                    return;
                }
                doInstall();
            }
        });
    }

    private void doInstall() {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse(APK_URI), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            jsCallback(state("installing", ""));
        } catch (Exception e) {
            showToast("无法打开安装界面：" + e.getMessage());
            jsCallback(state("error", "无法打开安装界面"));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 用户从「安装未知应用」设置页返回后，授权已给就自动续上，不用再点一次。
        if (pendingInstall) {
            pendingInstall = false;
            if (apkFile().isFile() && canInstall()) doInstall();
        }
        // Cancelling the system installer / permission page must not bypass the gate.
        if (forceUpdate && !gateShown) showForceGate();
        // Resume ping is throttled to once per 12h, so this is effectively free.
        pingUsage();
    }

    /** Keep the OS bars in sync with the reader theme (light / sepia / dark). */
    private void applySystemBarStyle(String theme) {
        boolean dark = "dark".equals(theme);
        boolean sepia = "sepia".equals(theme);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            w.setStatusBarColor(dark ? 0xFF171A21 : (sepia ? 0xFFF4ECDC : 0xFFF1F3F7));
            w.setNavigationBarColor(dark ? 0xFF1E222C : 0xFFFFFFFF);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View d = w.getDecorView();
            int f = d.getSystemUiVisibility();
            if (dark) f &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            else f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (dark) f &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                else f |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            d.setSystemUiVisibility(f);
        }
    }

    private final class NativeBridge {
        @JavascriptInterface
        public void setTheme(final String theme) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    applySystemBarStyle(theme);
                }
            });
        }

        @JavascriptInterface
        public void saveFile(String name, String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "export");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建导出目录");
                String safe = (name == null ? "export.bin" : name)
                        .replaceAll("[\\\\/:*?\"<>|]", "_");
                File f = new File(dir, safe);
                FileOutputStream out = new FileOutputStream(f);
                try {
                    out.write(data);
                } finally {
                    out.close();
                }
                showToast("已导出: " + f.getAbsolutePath());
            } catch (Exception e) {
                showToast("保存失败: " + e.getMessage());
            }
        }

        /** 整库备份：先落私有缓存，再让用户用系统保存窗口选位置 / 改文件名。 */
        @JavascriptInterface
        public void saveBackup(final String name, final String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                File tmp = new File(getCacheDir(), PENDING_BACKUP);
                FileOutputStream out = new FileOutputStream(tmp);
                try { out.write(data); } finally { out.close(); }
                String safe = safeBackupName(name);
                prefs().edit().putString("pending_backup_name", safe).apply();
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/octet-stream");
                i.putExtra(Intent.EXTRA_TITLE, safe);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                i.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                if (Build.VERSION.SDK_INT >= 26) {
                    String last = prefs().getString("last_backup_uri", null);
                    if (last != null && last.length() > 0)
                        i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(last));
                }
                // JS 桥跑在 JavaBridge 线程；启动系统窗口必须回到 UI 线程。
                final Intent picker = i;
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try {
                            startActivityForResult(
                                    Intent.createChooser(picker, "选择备份保存位置"), REQ_SAVE);
                        } catch (Exception e) {
                            try {
                                startActivityForResult(picker, REQ_SAVE);
                            } catch (Exception e2) {
                                // 极老 ROM 没有系统保存窗口时退回私有目录，备份仍可用。
                                showToast("系统保存窗口不可用，已改用默认目录");
                                saveFile(name, b64);
                            }
                        }
                    }
                });
            } catch (Exception e) {
                showToast("备份失败：" + e.getMessage());
            }
        }

        /** 设置里显示上次备份文件名；空串表示还没备份过。 */
        @JavascriptInterface
        public String lastBackupName() {
            return prefs().getString("last_backup_name", "");
        }

        @JavascriptInterface
        public void toast(String msg) {
            showToast(msg);
        }

        /** JS 自检信息落到 logcat，真机排查时 adb logcat -s OpenReader 即可查看。 */
        @JavascriptInterface
        public void log(String msg) {
            Log.i("OpenReader", "JS: " + msg);
        }

        /** 自检条用：厂商/型号、Android 版本、dp 尺寸、密度、smallestWidth。 */
        @JavascriptInterface
        public String deviceInfo() {
            DisplayMetrics dm = getResources().getDisplayMetrics();
            return Build.MANUFACTURER + " " + Build.MODEL
                    + " | Android " + Build.VERSION.RELEASE
                    + " | " + Math.round(dm.widthPixels / dm.density) + "x"
                    + Math.round(dm.heightPixels / dm.density) + "dp"
                    + " | sw" + getResources().getConfiguration().smallestScreenWidthDp + "dp"
                    + " | x" + dm.density;
        }

        /** 启动静默检查（false）/ 设置页手动检查（true）。 */
        @JavascriptInterface
        public void checkUpdate(boolean manual) {
            runCheckUpdate(manual);
        }

        /** 下载 + SHA-256 校验 + 调起系统安装器。 */
        @JavascriptInterface
        public void downloadAndInstall(String url, String sha256) {
            runDownloadAndInstall(url, sha256);
        }

        /** 用户授权「安装未知应用」回来后重试，已下载的包不必重下。 */
        @JavascriptInterface
        public void installNow() {
            if (apkFile().isFile()) installIfAllowed();
        }

        /** 设置页读写「匿名使用统计」开关，默认开启。 */
        @JavascriptInterface
        public boolean statsOptIn() {
            return prefs().getBoolean("stats_opt_in", true);
        }

        @JavascriptInterface
        public void setStatsOptIn(boolean on) {
            prefs().edit().putBoolean("stats_opt_in", on).apply();
        }
    }

    /** Back = close drawer / leave reader / back to shelf; double-press to exit. */
    @Override
    public void onBackPressed() {
        // Mandatory update: no way to reach the reader by pressing Back.
        if (forceUpdate) { finishAffinity(); return; }
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript(
            "(function(){try{return !!(window.__orBack && window.__orBack());}catch(e){return false;}})()",
            new ValueCallback<String>() {
                @Override public void onReceiveValue(String value) {
                    if ("true".equals(value)) return;
                    long now = System.currentTimeMillis();
                    if (now - lastBackAt < 2000L) {
                        finish();
                    } else {
                        lastBackAt = now;
                        showToast("再按一次返回键退出");
                    }
                }
            });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
