package com.openreader.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Minimal, dependency-free FileProvider equivalent.
 *
 * This project links only android.jar (no androidx), so the SDK's
 * androidx.core.content.FileProvider is unavailable. Android 7+ forbids
 * file:// URIs across apps, hence this read-only provider exposes the
 * downloaded APK as content://com.openreader.app.apkprovider/update.apk.
 *
 * Hardening: exported=false + grantUriPermissions=true in the manifest,
 * only one fixed filename is served, only mode "r", no path traversal.
 */
public class ApkProvider extends ContentProvider {

    static final String APK_NAME = "update.apk";

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (uri == null || !APK_NAME.equals(uri.getLastPathSegment())) {
            throw new FileNotFoundException("unexpected name");
        }
        if (mode != null && !"r".equals(mode)) {
            throw new FileNotFoundException("read only");
        }
        File f = new File(new File(getContext().getFilesDir(), "apk"), APK_NAME);
        if (!f.isFile()) {
            throw new FileNotFoundException("not downloaded");
        }
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
