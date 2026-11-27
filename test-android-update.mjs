/* 应用内更新链路自检（不需要 Chrome / 真机）
   覆盖：版本单一来源、Manifest 权限与 provider、原生下载/校验/安装、
        前端回调与静默失败、云端路由、发布清单与 APK 的 sha256 一致性、签名备份。
   Usage: node test-android-update.mjs     （应在 build-apk.ps1 之后跑）
*/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const A = path.join(HERE, 'app', 'src', 'main', 'assets');
const JAVA = path.join(HERE, 'app', 'src', 'main', 'java', 'com', 'openreader', 'app');
const PA = path.join(HERE, '..', 'Server', 'qiushu-pa');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK   ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + '  ' + extra); }
};
const read = (p) => fs.readFileSync(p, 'utf8');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

console.log('=== 应用内更新链路自检 ===');

/* ---------- 1. 版本单一来源 ---------- */
const V = JSON.parse(read(path.join(HERE, 'version.json')));
ok('version.json 字段齐全',
  Number.isInteger(V.code) && /^\d+\.\d+\.\d+$/.test(V.name)
  && V.notes && V.update_url.startsWith('https://')
  && V.download_url.startsWith('https://') && 'fallback_url' in V
  && V.force === true);
const manifest = read(path.join(HERE, 'app', 'src', 'main', 'AndroidManifest.xml'));
const gradle = read(path.join(HERE, 'app', 'build.gradle'));
const ps1 = read(path.join(HERE, 'build-apk.ps1'));
const html = read(path.join(A, 'index.html'));
ok('Manifest / gradle / HTML 版本都来自 version.json',
  manifest.includes('versionCode="' + V.code + '"')
  && manifest.includes('versionName="' + V.name + '"')
  && gradle.includes('versionCode ' + V.code)
  && gradle.includes("versionName '" + V.name + "'")
  && html.includes('ANDROID v' + V.name)
  && html.includes('name="or-version" content="' + V.name + '"'));
ok('build-apk.ps1 用 $V 传版本、不硬编码',
  ps1.includes("'--version-code', ([string]$V.code)")
  && ps1.includes("'--version-name', ([string]$V.name)")
  && !/--version-code'?\s*,?\s*'\d+'/.test(ps1));
ok('build-apk.ps1 编译 res 图标并传给 aapt2 link',
  ps1.includes("$ResTmp") && ps1.includes("'compile'")
  && ps1.includes("'-R'") && ps1.includes('$Force = if'));
ok('Manifest 声明圆角 / 圆形图标',
  manifest.includes('android:icon="@mipmap/ic_launcher"')
  && manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"'));

/* ---------- 2. 安装权限与零依赖 provider ---------- */
ok('声明 REQUEST_INSTALL_PACKAGES', manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES'));
ok('provider exported=false + 临时 URI 授权',
  /<provider[\s\S]*?android:name="\.ApkProvider"[\s\S]*?android:exported="false"[\s\S]*?android:grantUriPermissions="true"[\s\S]*?\/>/.test(manifest));
const provider = read(path.join(JAVA, 'ApkProvider.java'));
ok('ApkProvider 只放行固定文件名且只读',
  provider.includes('APK_NAME.equals(uri.getLastPathSegment())')
  && provider.includes('!"r".equals(mode)')
  && provider.includes('MODE_READ_ONLY'));
ok('ApkProvider 无 androidx 依赖（注释里提到不算）',
  !/^\s*import\s+androidx/m.test(provider));

/* ---------- 3. 原生更新链路 ---------- */
const java = read(path.join(JAVA, 'MainActivity.java'));
for (const [name, needle] of [
  ['固定 HTTPS 更新地址', '"' + V.update_url + '"'],
  ['版本比较 remote > current', 'remote > currentVersionCode()'],
  ['检查超时 8 秒', 'httpGet(UPDATE_URL, 8000)'],
  ['下载前强制 https', 'url.startsWith("https://")'],
  ['下载时流式算 SHA-256', 'MessageDigest.getInstance("SHA-256")'],
  ['sha256 不符即删包', '!sha256.equalsIgnoreCase(got)'],
  ['未知来源授权检查', 'canRequestPackageInstalls()'],
  ['授权设置页跳转', 'Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES'],
  ['content:// 交给系统安装器', 'ACTION_VIEW'],
  ['URI 读权限 flag', 'FLAG_GRANT_READ_URI_PERMISSION'],
  ['授权返回自动续装', 'pendingInstall'],
  ['失败只写 logcat 不弹错', 'Log.i("OpenReader", "update check: "'],
  ['冷启动即检查', 'startupUpdateCheck();'],
  ['force 缺省为 true', 'j.optBoolean("force", true)'],
  ['清单不完整则放行', 'sha.length() < 64'],
  ['站点挂掉不锁死 App', 'startup update check skipped'],
  ['更新门不可取消', 'setCancelable(false)'],
  ['更新门禁用 WebView', 'web.setEnabled(false)'],
  ['返回键不能绕过', 'if (forceUpdate) { finishAffinity(); return; }'],
  ['安装器取消后重显门', 'if (forceUpdate && !gateShown) showForceGate();'],
  ['强制下载仍校验 SHA-256', '!fuSha.equalsIgnoreCase(got)'],
]) ok('Java ' + name, java.includes(needle));
ok('强制门文案不含「必须更新后才能继续阅读」',
  !java.includes('必须更新后才能继续阅读')
  && java.includes('覆盖安装不会清空本地书库'));

/* ---------- v1.12.0 整库备份：自定义名字/位置 + 恢复自动定位 ---------- */
for (const [name, needle] of [
  ['用系统保存窗口选位置', 'Intent.ACTION_CREATE_DOCUMENT'],
  ['窗口里可编辑文件名', 'Intent.EXTRA_TITLE'],
  ['记住上次备份位置', 'last_backup_uri'],
  ['恢复选择器定位到备份位置', 'DocumentsContract.EXTRA_INITIAL_URI'],
  ['恢复走系统打开文档', 'Intent.ACTION_OPEN_DOCUMENT'],
  ['持久化 URI 读写权限', 'takePersistableUriPermission'],
  ['数据先落私有缓存防重建丢失', 'PENDING_BACKUP'],
  ['文件名清洗并补后缀', 'safeBackupName'],
  ['设置可读上次备份名', 'public String lastBackupName()'],
  ['保存窗口不可用时回退旧导出', 'saveFile(name, b64)'],
]) ok('备份 ' + name, java.includes(needle));
// 更新检查本身仍然不带任何设备标识；匿名统计是独立的可关闭上报。
const updatePart = java.split('/* ---------- 匿名使用统计')[0];
ok('更新请求不带任何设备标识',
  !/getDeviceId|device_id|ANDROID_ID|getImei/.test(updatePart));
ok('统计 ping 独立、默认可关、只报四项',
  java.includes('private static final String PING_URL')
  && java.includes('getBoolean("stats_opt_in", true)')
  && java.includes('body.put("model"')
  && !/body\.put\("(title|book|path|file)/.test(java));
ok('三个 JS 接口都带 @JavascriptInterface',
  ['checkUpdate', 'downloadAndInstall', 'installNow'].every((m) =>
    new RegExp('@JavascriptInterface\\s+public void ' + m + '\\(').test(java)));
ok('下载目录是应用私有 files/apk（无需存储权限）',
  java.includes('new File(getFilesDir(), "apk")'));

/* ---------- 4. 前端回调 / 静默策略 ---------- */
const appjs = read(path.join(A, 'app.js'));
const bundle = read(path.join(A, 'bundle.js'));
for (const [name, needle] of [
  ['原生回调入口', 'window.__orUpdateResult'],
  ['启动检查已交给原生门', 'startupUpdateCheck()'],
  ['前端不再重复发启动请求', '前端不再自动发请求'],
  ['手动检查 true', 'checkUpdate(true)'],
  ['设置页入口', 'id="s-update"'],
  ['校验失败才提示', 'if (manual) toast(p.message'],
  ['授权重试', 'showPermissionDialog'],
]) ok('app.js ' + name, appjs.includes(needle));
ok('bundle 已包含更新实现', bundle.includes('__orUpdateResult') && bundle.includes('checkUpdate'));
ok('桌面无原生桥时更新入口隐藏',
  appjs.includes('const updater = !!(window.AndroidNative'));

/* ---------- 5. 云端更新源 ---------- */
const cloud = read(path.join(PA, 'qiushu_app.py'));
const install = read(path.join(PA, 'install.py'));
const placeholder = JSON.parse(read(path.join(PA, 'or_update', 'update.json')));
ok('云端有 update.json 路由', cloud.includes('@bp.route("/or/update.json")'));
ok('云端有 APK 下载路由', cloud.includes('@bp.route("/or/OpenReader.apk")'));
ok('云端有人工下载页', cloud.includes('@bp.route("/or/")'));
ok('响应 no-store + 跨域', cloud.includes('no-store, max-age=0')
  && cloud.includes('Access-Control-Allow-Origin'));
ok('APK MIME 正确', cloud.includes('application/vnd.android.package-archive'));
ok('路由只读固定文件、无路径拼接用户输入',
  cloud.includes('read_or_file("update.json")') && cloud.includes('read_or_file("OpenReader.apk")'));
ok('install.py 检查发布文件', install.includes('or_update", "update.json"'));
ok('占位清单不触发误更新', placeholder._placeholder === true
  && placeholder.code < V.code);
const zip = path.join(HERE, '..', 'Server', 'qiushu-pa.zip');
ok('部署包存在', fs.existsSync(zip));

/* ---------- 6. 发布产物与 APK 字节一致性 ---------- */
const pubDir = path.join(HERE, 'publish');
const pubJson = path.join(pubDir, 'update.json');
const pubApk = path.join(pubDir, 'OpenReader.apk');
if (fs.existsSync(pubJson) && fs.existsSync(pubApk)) {
  const raw = fs.readFileSync(pubJson);
  ok('发布清单是 UTF-8 无 BOM（org.json 才不报错）',
    !(raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF));
  const p = JSON.parse(raw.toString('utf8'));
  ok('发布清单版本与 version.json 一致',
    p.code === V.code && p.name === V.name);
  ok('发布清单 URL 与 version.json 一致',
    p.url === V.download_url && 'fallback_url' in p);
  ok('发布清单 force 与 version.json 一致', p.force === V.force);
  ok('发布清单 sha256 == APK 实际 SHA-256', p.sha256 === sha(pubApk),
    p.sha256.slice(0, 16));
  ok('发布 APK 与主产物逐字节相同',
    fs.readFileSync(pubApk).equals(fs.readFileSync(path.join(HERE, 'OpenReader.apk'))));
  // 版本判定逻辑（与 Java 的 remote > current 一致）
  const shouldPrompt = (remote, current) => remote > current;
  ok('版本比较：低/相等不提示、更高才提示',
    !shouldPrompt(V.code - 1, V.code) && !shouldPrompt(V.code, V.code)
    && shouldPrompt(V.code + 1, V.code));
} else {
  ok('发布目录已生成（先跑 build-apk.ps1）', false, pubDir);
}

/* ---------- 7. 签名备份（换签名 = 用户必须卸载，书库全丢） ---------- */
const ks = path.join(HERE, 'debug.keystore');
const backups = [
  path.join(HERE, '_签名备份', 'debug.keystore'),
  path.join(HERE, '..', 'PC', '_签名备份-debug.keystore'),
];
ok('签名密钥存在且至少两处备份',
  fs.existsSync(ks) && backups.every((p) => fs.existsSync(p) && sha(p) === sha(ks)),
  sha(ks).slice(0, 16));

/* ---------- 8. 圆角启动图标 ---------- */
const pngSize = (p) => {
  const b = fs.readFileSync(p);
  if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const iconDir = path.join(HERE, 'app', 'src', 'main', 'res');
let iconsOk = true, iconCount = 0;
for (const [folder, size] of Object.entries({
  'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192,
})) {
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    const f = path.join(iconDir, folder, name);
    const dim = fs.existsSync(f) ? pngSize(f) : null;
    if (!dim || dim[0] !== size || dim[1] !== size) iconsOk = false;
    else iconCount++;
  }
}
ok('5 个密度 x 2 种形状共 10 个合法 PNG，尺寸正确', iconsOk && iconCount === 10,
  iconCount + '/10');
ok('图标生成脚本保留源码（可改设计重生成）',
  fs.existsSync(path.join(HERE, 'make-icon.py')));

/* ---------- 9. L2 防篡改：签名指纹 + assets 哈希（构建时注入） ---------- */
const integrity = fs.existsSync(path.join(JAVA, 'Integrity.java'))
  ? read(path.join(JAVA, 'Integrity.java')) : '';
ok('Integrity.java 存在且开发态为 DEV 占位',
  integrity.includes('SIGNATURE_SHA256 = "DEV"') && integrity.includes('ASSET_HASHES = "DEV"'));
ok('build-apk.ps1 注入签名指纹与 assets 哈希',
  ps1.includes("keytool.exe") && ps1.includes('SIGNATURE_SHA256 = "__SIG__"')
  && ps1.includes('ASSET_HASHES = "__ASSETS__"') && ps1.includes('$assetEntries'));
ok('MainActivity 启动前校验签名、后台校验 assets',
  java.includes('Integrity.enabled() && !signatureMatches()')
  && java.includes('private void verifyAssets()')
  && java.includes('GET_SIGNING_CERTIFICATES'));
ok('两处 L2 校验均只记录日志，不弹窗、不退出',
  java.includes('signature fingerprint mismatch (recorded only)')
  && java.includes('asset hash mismatch (recorded only)')
  && !java.includes('showToast("检测到应用文件被修改')
  && !java.includes('showIntegrityFatal()'));
ok('桌面完整性校验只写日志、不弹窗',
  read(path.join(HERE, '..', 'PC', 'electron', 'main.cjs'))
    .includes('仅记录，不影响使用')
  && !read(path.join(HERE, '..', 'PC', 'electron', 'main.cjs'))
    .includes('检测到程序文件被修改：'));
ok('书卡 ⋯ 已移除，改为长按弹菜单',
  !read(path.join(HERE, '..', 'PC', 'src', 'web', 'app.js')).includes('class="card-more"')
  && read(path.join(HERE, '..', 'PC', 'src', 'web', 'app.js')).includes('function bindLongPress(')
  && read(path.join(HERE, '..', 'PC', 'src', 'web', 'app.js')).includes('longPressFired'));

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) process.exit(1);
