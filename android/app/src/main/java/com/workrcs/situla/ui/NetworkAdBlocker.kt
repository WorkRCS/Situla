package com.workrcs.situla.ui

import android.content.Context
import android.net.Uri
import android.util.Log
import android.webkit.WebResourceResponse
import org.json.JSONObject
import org.mlm.adblock.AdblockEngine
import org.mlm.adblock.RequestTypeMapper
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Brave adblock-rust integration for the Android WebView.
 *
 * The JNI bridge is a third-party MPL-2.0 wrapper around Brave's MPL-2.0
 * adblock-rust engine. Filter lists are downloaded off the UI thread and
 * cached locally; a small built-in host-rule set remains as an offline fallback.
 *
 * WebView's request callback does not expose all browser request metadata, so
 * this is a best-effort integration rather than a full Brave Shields clone.
 */
object NetworkAdBlocker {
    private const val TAG = "SitulaAdBlock"
    private const val FILTER_CACHE_FILE = "situla-brave-filter-lists.txt"
    private const val FILTER_REFRESH_INTERVAL_MS = 12L * 60L * 60L * 1000L
    private const val CONNECT_TIMEOUT_MS = 12_000
    private const val READ_TIMEOUT_MS = 24_000
    private const val MAX_FILTER_LIST_CHARS = 8 * 1024 * 1024

    private val blockedDomains = setOf(
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "adnxs.com",
        "adform.net",
        "adsterra.com",
        "exoclick.com",
        "popads.net",
        "popcash.net",
        "propellerads.com",
        "trafficjunky.net",
        "onclickads.net",
        "clickadu.com",
        "hilltopads.com",
        "hilltopads.net",
        "juicyads.com",
        "mgid.com",
        "outbrain.com",
        "taboola.com",
        "criteo.com",
        "rubiconproject.com",
        "pubmatic.com",
        "openx.net",
        "smartadserver.com",
        "bidswitch.net",
        "advertising.com",
        "adsrvr.org",
        "adroll.com",
        "quantserve.com",
        "scorecardresearch.com",
        "revcontent.com",
        "adcash.com",
        "adnow.com",
        "monetag.com",
        "zedo.com",
        "casalemedia.com",
        "yieldmo.com",
        "sharethrough.com",
        "triplelift.com",
        "media.net",
        "lijit.com",
        "smaato.net",
        "inmobi.com",
        "adcolony.com",
        "chartboost.com",
        "unityads.unity3d.com",
        "adsymptotic.com",
        "bidvertiser.com",
        "popunder.net",
        "ad-maven.com",
        "google-analytics.com",
        "hotjar.com"
    )

    // Brave documents EasyList, EasyPrivacy and uBlock Origin lists as core
    // community-maintained sources. Brave's unbreak list helps avoid breakage.
    private val filterListUrls = listOf(
        "https://easylist.to/easylist/easylist.txt",
        "https://easylist.to/easylist/easyprivacy.txt",
        "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
        "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt",
        "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-specific.txt",
        "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-android-specific.txt",
        "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty-regional.txt",
        "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt"
    )

    private val fallbackRules = blockedDomains.joinToString("\n") { "||$it^" }
    private val initializationStarted = AtomicBoolean(false)
    private val initializationExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "situla-brave-adblock").apply { isDaemon = true }
    }
    private val engineLock = Any()

    @Volatile private var activeEngine: AdblockEngine? = null
    @Volatile private var situlaWebsiteHost: String = "situla-five.vercel.app"

    /**
     * Start adblock initialization without delaying WebView creation.
     * Existing cached filters are activated first; updates happen in the background.
     */
    fun initialize(context: Context, websiteUrl: String? = null) {
        websiteUrl?.let { url ->
            Uri.parse(url).host?.lowercase(Locale.ROOT)?.let { situlaWebsiteHost = it }
        }
        if (!initializationStarted.compareAndSet(false, true)) return

        val appContext = context.applicationContext
        // Install the small built-in rule set before WebView starts loading pages,
        // so the first requests do not race the asynchronous filter-list download.
        if (activeEngine == null) installEngine(appContext, fallbackRules)

        initializationExecutor.execute {
            try {
                initializeOnWorker(appContext)
            } catch (error: Throwable) {
                Log.w(TAG, "Brave adblock initialization failed; keeping host fallback.", error)
                initializationStarted.set(false)
            }
        }
    }

    private fun initializeOnWorker(context: Context) {
        val cacheFile = File(context.filesDir, FILTER_CACHE_FILE)
        val cachedRules = runCatching {
            cacheFile.takeIf { it.isFile && it.length() in 1..(32L * 1024L * 1024L) }?.readText()
        }.getOrNull()

        val initialRules = cachedRules?.takeIf { it.length > 1_000 }
        if (initialRules != null) {
            installEngine(context, initialRules)
        } else if (activeEngine == null) {
            installEngine(context, fallbackRules)
        }

        val cacheIsFresh = cacheFile.isFile &&
            System.currentTimeMillis() - cacheFile.lastModified() < FILTER_REFRESH_INTERVAL_MS
        if (cacheIsFresh) return

        val downloadedLists = filterListUrls.mapNotNull { url ->
            runCatching { downloadFilterList(url) }
                .onFailure { Log.w(TAG, "Unable to refresh filter list: $url", it) }
                .getOrNull()
        }
        if (downloadedLists.isEmpty()) {
            Log.w(TAG, "No online filter lists were refreshed; cached/fallback rules remain active.")
            return
        }

        val combinedRules = (listOf(fallbackRules) + downloadedLists).joinToString("\n")
        runCatching {
            val temporaryFile = File(context.filesDir, "$FILTER_CACHE_FILE.tmp")
            temporaryFile.writeText(combinedRules, Charsets.UTF_8)
            if (cacheFile.exists()) cacheFile.delete()
            if (!temporaryFile.renameTo(cacheFile)) {
                cacheFile.writeText(combinedRules, Charsets.UTF_8)
                temporaryFile.delete()
            }
        }.onFailure { Log.w(TAG, "Could not cache refreshed filter lists.", it) }

        if (installEngine(context, combinedRules)) {
            Log.i(TAG, "Brave adblock-rust loaded ${downloadedLists.size} filter lists.")
        }
    }

    private fun downloadFilterList(listUrl: String): String? {
        val connection = (URL(listUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "Situla-Android-Adblock/1.0")
            setRequestProperty("Accept", "text/plain,*/*")
        }

        return try {
            if (connection.contentLengthLong > MAX_FILTER_LIST_CHARS.toLong()) return null
            val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                val result = StringBuilder()
                val buffer = CharArray(8_192)
                while (true) {
                    val count = reader.read(buffer)
                    if (count < 0) break
                    if (result.length + count > MAX_FILTER_LIST_CHARS) return null
                    result.append(buffer, 0, count)
                }
                result.toString()
            }
            val normalized = text.trimStart()
            if (connection.responseCode in 200..299 &&
                text.length > 1_000 &&
                !normalized.startsWith("<!doctype html", ignoreCase = true) &&
                !normalized.startsWith("<html", ignoreCase = true)
            ) text else null
        } finally {
            connection.disconnect()
        }
    }

    private fun installEngine(context: Context, rules: String): Boolean {
        val candidate = try {
            AdblockEngine.create()
        } catch (error: Throwable) {
            Log.w(TAG, "Brave adblock native library is unavailable.", error)
            return false
        }

        if (!runCatching { candidate.loadFilterList(rules) }.getOrDefault(false)) {
            candidate.close()
            Log.w(TAG, "Brave adblock-rust rejected the filter list.")
            return false
        }

        runCatching {
            val resources = context.assets.open("adblock/resources.json")
                .bufferedReader(Charsets.UTF_8).use { it.readText() }
            candidate.loadResources(resources)
        }.onFailure {
            // Network filtering remains useful if cosmetic/scriptlet resources fail to load.
            Log.w(TAG, "Brave cosmetic/scriptlet resources could not be loaded.", it)
        }

        val previous = synchronized(engineLock) {
            val old = activeEngine
            activeEngine = candidate
            old
        }
        runCatching { previous?.close() }
        return true
    }

    fun shouldBlock(
        uri: Uri,
        sourceUrl: String? = null,
        acceptHeaderOrType: String? = null,
        isMainFrame: Boolean = false
    ): Boolean {
        val host = uri.host?.lowercase(Locale.ROOT)?.trimEnd('.') ?: return false
        if (blockedDomains.any { domain -> host == domain || host.endsWith(".$domain") }) return true

        val requestType = if (isMainFrame) {
            "document"
        } else {
            RequestTypeMapper.from(uri, acceptHeaderOrType)
        }
        val source = sourceUrl?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
            ?: "https://$situlaWebsiteHost/"

        return synchronized(engineLock) {
            runCatching {
                activeEngine?.checkNetworkRequest(uri.toString(), source, requestType)?.matched ?: false
            }.getOrDefault(false)
        }
    }

    /**
     * Cosmetic rules apply to the Situla document itself. Cross-origin player
     * iframe DOMs cannot be inspected or rewritten by the parent WebView.
     */
    fun cosmeticScriptFor(pageUrl: String): String? {
        if (!isSitulaPage(pageUrl)) return null
        val resources = synchronized(engineLock) {
            runCatching { activeEngine?.cosmeticResources(pageUrl) }.getOrNull()
        } ?: return null

        val css = resources.css()
        val scriptlets = resources.js
        if (css.isBlank() && scriptlets.isBlank()) return null

        val cssLiteral = JSONObject.quote(css)
        val scriptletsLiteral = JSONObject.quote(scriptlets)
        return """
            (function () {
              try {
                var css = $cssLiteral;
                if (css) {
                  var style = document.getElementById('situla-brave-adblock-css');
                  if (!style) {
                    style = document.createElement('style');
                    style.id = 'situla-brave-adblock-css';
                    (document.head || document.documentElement).appendChild(style);
                  }
                  style.textContent = css;
                }
              } catch (_) {}
              try {
                var scriptlets = $scriptletsLiteral;
                if (scriptlets) (0, eval)(scriptlets);
              } catch (_) {}
            })();
        """.trimIndent()
    }

    private fun isSitulaPage(url: String): Boolean =
        Uri.parse(url).host?.lowercase(Locale.ROOT) == situlaWebsiteHost

    fun isTrustedTopLevel(uri: Uri): Boolean {
        val host = uri.host?.lowercase(Locale.ROOT)?.trimEnd('.') ?: return false
        return host == situlaWebsiteHost ||
            host == "vidlink.pro" ||
            host.endsWith(".vidlink.pro") ||
            host == "slast430did.com" ||
            host.endsWith(".slast430did.com") ||
            host == "localhost" ||
            host == "10.0.2.2"
    }

    fun emptyResponse(): WebResourceResponse =
        WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
}
