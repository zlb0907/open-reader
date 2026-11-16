package com.openreader.app;

/**
 * Build-time integrity constants. build-apk.ps1 overwrites this file in its
 * staging workspace with the real signing certificate fingerprint and the
 * SHA-256 of every file under assets/. The checked-in copy stays "DEV" so a
 * hand-compiled development build skips the checks instead of bricking.
 */
public final class Integrity {
    private Integrity() {}

    public static final String SIGNATURE_SHA256 = "DEV";
    public static final String ASSET_HASHES = "DEV";

    public static boolean enabled() {
        return !"DEV".equals(SIGNATURE_SHA256);
    }
}
