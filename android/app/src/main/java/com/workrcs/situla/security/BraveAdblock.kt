package com.workrcs.situla.security

/**
 * JNI bridge to Brave's adblock-rust engine.
 * The engine is compiled from android/adblock-rust for Android ABIs by Gradle.
 */
object BraveAdblock {
    @Volatile var ready: Boolean = false
        private set

    @Volatile var lastError: String? = null
        private set

    init {
        try {
            System.loadLibrary("situla_adblock")
        } catch (error: UnsatisfiedLinkError) {
            lastError = error.message ?: "Native adblock library is unavailable."
        }
    }

    external fun nativeLoadFilters(standardRules: String, hostsRules: String): Boolean
    private external fun nativeShouldBlock(url: String, sourceUrl: String, requestType: String): Boolean
    external fun nativeCosmeticPayload(url: String): String

    @Synchronized
    fun loadFilters(standardRules: String, hostsRules: String): Boolean {
        return try {
            ready = nativeLoadFilters(standardRules, hostsRules)
            lastError = if (ready) null else "The Rust filter engine did not initialize."
            ready
        } catch (error: Throwable) {
            ready = false
            lastError = error.message ?: "Could not initialize Brave adblock-rust."
            false
        }
    }

    fun shouldBlock(url: String, sourceUrl: String, requestType: String): Boolean {
        if (!ready || url.isBlank()) return false
        return try {
            nativeShouldBlock(url, sourceUrl, requestType)
        } catch (_: Throwable) {
            false
        }
    }
}