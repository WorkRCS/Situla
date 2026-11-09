package com.workrcs.situla.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.SafeBrowsingResponse
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.workrcs.situla.data.Movie
import com.workrcs.situla.data.SitulaDatabase
import com.workrcs.situla.data.WatchHistoryDao
import com.workrcs.situla.data.WatchHistoryEntity
import com.workrcs.situla.security.BraveAdblock
import java.io.ByteArrayInputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

private class VidLinkProgressBridge(
    private val movie: Movie,
    private val dao: WatchHistoryDao,
    initialPositionMs: Long,
    private val bridgeToken: String,
    private val reportStatus: (String, String) -> Unit,
    private val onPlayerPlay: () -> Unit,
    private val isFilteringActive: () -> Boolean
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))
    private var lastPositionMs = initialPositionMs
    private var totalWatchedMs = 0L
    private var lastEventElapsedMs = SystemClock.elapsedRealtime()
    private var lastPersistElapsedMs = 0L

    @Synchronized
    fun resetResumePosition(positionMs: Long, watchedMs: Long) {
        lastPositionMs = positionMs.coerceAtLeast(0L)
        totalWatchedMs = watchedMs.coerceAtLeast(0L)
        lastEventElapsedMs = SystemClock.elapsedRealtime()
        lastPersistElapsedMs = lastEventElapsedMs
    }

    @JavascriptInterface
    fun activateFiltering(token: String) {
        if (token != bridgeToken) return
        onPlayerPlay()
    }

    @JavascriptInterface
    fun cosmeticPayload(token: String, pageUrl: String): String {
        if (token != bridgeToken || !isFilteringActive() || !BraveAdblock.ready) {
            return "__SITULA_FILTERS_NOT_READY__"
        }
        val pageUri = runCatching { Uri.parse(pageUrl) }.getOrNull() ?: return "{}"
        if (!isVidLinkHost(pageUri)) return "{}"
        return runCatching { BraveAdblock.nativeCosmeticPayload(pageUrl) }
            .getOrDefault("{\"css\":\"\",\"script\":\"\"}")
    }

    @JavascriptInterface
    fun onPlayerStatus(token: String, status: String, detail: String) {
        if (token != bridgeToken) return
        reportStatus(status.take(80), detail.take(700))
    }

    @JavascriptInterface
    @Synchronized
    fun onProgress(token: String, currentTimeSeconds: Double, durationSeconds: Double, event: String) {
        if (token != bridgeToken) return
        if (!currentTimeSeconds.isFinite() || !durationSeconds.isFinite()) return
        if (currentTimeSeconds < 0.0 || durationSeconds <= 0.0) return

        val positionMs = (currentTimeSeconds * 1000.0).toLong().coerceAtLeast(0L)
        val durationMs = (durationSeconds * 1000.0).toLong().coerceAtLeast(0L)
        val now = SystemClock.elapsedRealtime()
        val elapsed = (now - lastEventElapsedMs).coerceIn(0L, 20_000L)

        val countedEvents = event == "timeupdate" || event == "pause" || event == "ended"
        val advanced = positionMs >= lastPositionMs && positionMs - lastPositionMs <= elapsed + 3_000L
        val newlyWatched = if (countedEvents && advanced) positionMs - lastPositionMs else 0L

        // Seeking updates the resume position but does not count skipped content as watch time.
        totalWatchedMs += newlyWatched
        lastPositionMs = positionMs
        lastEventElapsedMs = now
        val shouldPersist = event == "pause" || event == "seeked" || event == "ended" ||
            (event == "timeupdate" && now - lastPersistElapsedMs >= 15_000L)
        if (!shouldPersist) return
        lastPersistElapsedMs = now
        val watchedSnapshot = totalWatchedMs

        scope.launch {
            dao.upsert(
                WatchHistoryEntity(
                    tmdbId = movie.tmdbId,
                    title = movie.title,
                    posterUrl = movie.posterUrl,
                    releaseYear = movie.releaseYear,
                    positionMs = positionMs.coerceAtMost(durationMs),
                    durationMs = durationMs,
                    watchedMs = watchedSnapshot,
                    completed = event == "ended" || (durationMs > 0L && positionMs >= durationMs * 0.95),
                    lastWatchedAtMs = System.currentTimeMillis()
                )
            )
        }
    }
}

private fun isVidLinkHost(uri: Uri): Boolean {
    val host = uri.host?.lowercase() ?: return false
    return host == "vidlink.pro" || host.endsWith(".vidlink.pro")
}

private fun htmlAttribute(value: String): String =
    value.replace("&", "&amp;")
        .replace("\"", "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@Composable
fun VidLinkPlayerScreen(
    movie: Movie,
    onBack: () -> Unit,
    embedded: Boolean = false
) {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val dao = remember { SitulaDatabase.get(context.applicationContext).watchHistoryDao() }

    var fullScreenView by remember { mutableStateOf<View?>(null) }
    var fullScreenCallback by remember { mutableStateOf<WebChromeClient.CustomViewCallback?>(null) }
    var previousOrientation by remember { mutableIntStateOf(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED) }
    var playerError by remember(movie.tmdbId) { mutableStateOf<String?>(null) }
    var playerStatus by remember(movie.tmdbId) { mutableStateOf("Loading VidLink player · Brave filtering waits for Play") }
    var playerDetail by remember(movie.tmdbId) { mutableStateOf("") }
    var iframeLoaded by remember(movie.tmdbId) { mutableStateOf(false) }
    var braveUiActive by remember(movie.tmdbId) { mutableStateOf(false) }
    var braveUiReady by remember(movie.tmdbId) { mutableStateOf(BraveAdblock.ready) }
    val braveFilterActive = remember(movie.tmdbId) { AtomicBoolean(false) }
    val playEventReceived = remember(movie.tmdbId) { AtomicBoolean(false) }
    val mainThreadHandler = remember { Handler(Looper.getMainLooper()) }
    val reportPlayerStatus: (String, String) -> Unit = { status, detail ->
        mainThreadHandler.post {
            playerStatus = status
            if (detail.isNotBlank()) playerDetail = detail
            if (status == "iframe_load_event") iframeLoaded = true
            if (status == "iframe_error") playerError = "VidLink iframe reported a load error. $detail"
            if (status == "iframe_load_timeout") playerError = "VidLink iframe did not emit a load event within 12 seconds. See the diagnostic detail below."
        }
    }
    val enableBraveAfterPlay: () -> Unit = {
        playEventReceived.set(true)
        if (BraveAdblock.ready) {
            if (braveFilterActive.compareAndSet(false, true)) {
                mainThreadHandler.post {
                    braveUiActive = true
                    playerStatus = "VidLink play event received · Brave filtering is now ON"
                    playerDetail = "Filtering subsequent iframe, script, tracker and ad requests. Existing requests already started are not retroactively cancelled."
                }
            }
        } else {
            mainThreadHandler.post {
                playerStatus = "Play detected · waiting for Brave filter engine to finish initializing"
                playerDetail = BraveAdblock.lastError ?: "Filter engine is still preparing. Playback is not blocked while it initializes."
            }
        }
    }
    val filterInitialization = produceState(initialValue = BraveAdblock.ready) {
        value = if (BraveAdblock.ready) true else
            runCatching {
                com.workrcs.situla.security.AdblockFilterRepository.refreshAndInitialize(context.applicationContext)
            }.getOrDefault(false)
    }
    LaunchedEffect(filterInitialization.value) {
        braveUiReady = filterInitialization.value
        if (filterInitialization.value && playEventReceived.get()) enableBraveAfterPlay()
    }
    val playerWebViewHolder = remember(movie.tmdbId) { arrayOfNulls<WebView>(1) }

    val exitFullScreen = remember(activity) {
        {
            val view = fullScreenView
            if (view != null) {
                (view.parent as? ViewGroup)?.removeView(view)
                fullScreenView = null
                fullScreenCallback?.onCustomViewHidden()
                fullScreenCallback = null
                activity?.let { host ->
                    host.requestedOrientation = previousOrientation
                    WindowCompat.setDecorFitsSystemWindows(host.window, true)
                    WindowInsetsControllerCompat(host.window, host.window.decorView)
                        .show(WindowInsetsCompat.Type.systemBars())
                }
            }
        }
    }

    BackHandler(enabled = !embedded, onBack = onBack)
    BackHandler(enabled = fullScreenView != null, onBack = exitFullScreen)

    DisposableEffect(activity) {
        onDispose { exitFullScreen() }
    }

    val resumePositionMs = remember(movie.tmdbId) { androidx.compose.runtime.mutableLongStateOf(0L) }
    val progressToken = remember(movie.tmdbId) { java.util.UUID.randomUUID().toString() }
    val progressBridge = remember(movie.tmdbId, progressToken) {
        VidLinkProgressBridge(movie, dao, 0L, progressToken, reportPlayerStatus, enableBraveAfterPlay, { braveFilterActive.get() })
    }
    val historyLoaded = produceState(initialValue = false, movie.tmdbId) {
        val saved = runCatching { dao.find(movie.tmdbId) }.getOrNull()
        if (saved != null && !saved.completed) {
            resumePositionMs.longValue = saved.positionMs.coerceAtLeast(0L)
            progressBridge.resetResumePosition(saved.positionMs, saved.watchedMs)
        }
        value = true
    }

    if (!historyLoaded.value) {
        Column(
            (if (embedded) Modifier.fillMaxWidth().aspectRatio(16f / 9f) else Modifier.fillMaxSize())
                .background(Color.Black).padding(20.dp)
        ) {
            Text("Preparing your resume position…", color = Color.White)
        }
        return
    }

    val playerUrl = remember(movie.tmdbId, resumePositionMs.longValue) {
        Uri.parse("https://vidlink.pro/movie/${movie.tmdbId}")
            .buildUpon()
            .appendQueryParameter("primaryColor", "B20710")
            .appendQueryParameter("secondaryColor", "170000")
            .appendQueryParameter("icons", "default")
            .appendQueryParameter("player", "default")
            .appendQueryParameter("autoplay", "false")
            .appendQueryParameter("title", "true")
            .appendQueryParameter("poster", "true")
            .apply {
                if (resumePositionMs.longValue > 0L) {
                    appendQueryParameter("startAt", (resumePositionMs.longValue / 1000L).toString())
                }
            }
            .build().toString()
    }

    val playerLoadKey = playerUrl

    val wrapperHtml = remember(playerUrl, progressToken) {
        """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
          <meta charset="utf-8">
          <style>
            html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:transparent; }
            iframe { display:block; border:0; width:100%; height:100%; background:transparent; }
          </style>
        </head>
        <body>
          <iframe id="situla-vidlink-player"
                  src="${htmlAttribute(playerUrl)}"
                  title="VidLink movie player"
                  width="100%" height="100%"
                  frameborder="0"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowfullscreen
                  webkitallowfullscreen></iframe>
          <script>
            (function() {
              'use strict';
              var frame = document.getElementById('situla-vidlink-player');
              var iframeSignaled = false;
              function report(status, detail) {
                try { SitulaProgress.onPlayerStatus('${progressToken}', status, String(detail || '')); }
                catch (ignored) {}
              }
              report('wrapper_ready', window.location.href);
              report('iframe_request_started', frame.src);
              frame.addEventListener('load', function() {
                iframeSignaled = true;
                report('iframe_load_event', frame.src);
              });
              frame.addEventListener('error', function() {
                iframeSignaled = true;
                report('iframe_error', frame.src);
              });
              setTimeout(function() {
                if (!iframeSignaled) report('iframe_load_timeout', frame.src);
              }, 12000);
              window.addEventListener('error', function(event) {
                report('wrapper_javascript_error', event.message || 'Unknown wrapper script error');
              });
              window.addEventListener('unhandledrejection', function(event) {
                report('wrapper_promise_error', String(event.reason || 'Unhandled promise rejection'));
              });
              window.addEventListener('message', function(event) {
                if (event.origin !== 'https://vidlink.pro') return;
                var payload = event.data || {};
                if (payload.type === 'PLAYER_EVENT' && payload.data) {
                  var player = payload.data;
                  var playerEvent = String(player.event || '');
                  report('vidlink_player_event', playerEvent || 'player event');
                  if (playerEvent === 'play') {
                    try { SitulaProgress.activateFiltering('${progressToken}'); }
                    catch (ignored) {}
                  }
                  if (typeof player.currentTime === 'number' &&
                      typeof player.duration === 'number') {
                    SitulaProgress.onProgress(
                      '${progressToken}',
                      player.currentTime,
                      player.duration,
                      String(player.event || 'timeupdate')
                    );
                  }
                } else if (payload.type === 'MEDIA_DATA' && payload.data && payload.data.progress) {
                  var progress = payload.data.progress;
                  report('vidlink_media_data', 'VidLink sent media progress data');
                  if (typeof progress.watched === 'number' &&
                      typeof progress.duration === 'number') {
                    SitulaProgress.onProgress('${progressToken}', progress.watched, progress.duration, 'timeupdate');
                  }
                }
              }, false);
            })();
          </script>
        </body>
        </html>
        """.trimIndent()
    }

    Column(
        (if (embedded) Modifier.fillMaxWidth() else Modifier.fillMaxSize())
            .background(Color.Black)
    ) {
        if (!embedded) {
            Button(onClick = onBack, modifier = Modifier.fillMaxWidth().padding(8.dp)) {
                Text("Back to movie details")
            }
        }
        Box(
            if (embedded) Modifier.fillMaxWidth().aspectRatio(16f / 9f)
            else Modifier.weight(1f).fillMaxWidth()
        ) {
            // This is Situla's local player frame, not remotely supplied by VidLink.
            // It remains visible while the remote iframe is blank, blocked or unavailable.
            AsyncImage(
                model = movie.backdropUrl ?: movie.posterUrl,
                contentDescription = movie.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        listOf(Color(0x77000000), Color(0xE6000000))
                    )
                )
            )
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { viewContext ->
                    WebView(viewContext).apply {
                        playerWebViewHolder[0] = this
                        // Keep the native movie artwork underneath the WebView until the
                        // remote VidLink document actually reports its iframe load event.
                        setBackgroundColor(AndroidColor.TRANSPARENT)
                        // Remote WebView inspection is enabled only for debug APKs.
                        WebView.setWebContentsDebuggingEnabled(
                            (viewContext.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                        )
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = true
                        settings.javaScriptCanOpenWindowsAutomatically = false
                        settings.setSupportMultipleWindows(false)
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.allowFileAccessFromFileURLs = false
                        settings.allowUniversalAccessFromFileURLs = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        settings.safeBrowsingEnabled = true
                        settings.setGeolocationEnabled(false)
                        // VidLink preloads its player shell/poster before Play. The Brave
                        // engine initializes in the background and only filters network requests
                        // after VidLink sends PLAYER_EVENT: play.
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        addJavascriptInterface(progressBridge, "SitulaProgress")

                        val cosmeticInjection = """
                            (function() {
                              'use strict';
                              var token = '__SITULA_TOKEN__';
                              var attempts = 0;
                              var interactionActivated = false;
                              function activateOnFirstInteraction() {
                                if (interactionActivated || !window.SitulaProgress ||
                                    typeof window.SitulaProgress.activateFiltering !== 'function') return;
                                interactionActivated = true;
                                window.SitulaProgress.activateFiltering(token);
                                window.SitulaProgress.onPlayerStatus(
                                  token,
                                  'player_interaction_detected',
                                  'First touch/click inside VidLink iframe: Brave request filtering activated.'
                                );
                              }
                              document.addEventListener('pointerdown', activateOnFirstInteraction, true);
                              document.addEventListener('touchstart', activateOnFirstInteraction, { capture: true, passive: true });
                              document.addEventListener('click', activateOnFirstInteraction, true);
                              var timer = setInterval(function() {
                                attempts += 1;
                                try {
                                  if (!window.SitulaProgress || typeof window.SitulaProgress.cosmeticPayload !== 'function') {
                                    if (attempts >= 120) clearInterval(timer);
                                    return;
                                  }
                                  var raw = window.SitulaProgress.cosmeticPayload(token, String(window.location.href));
                                  if (raw === '__SITULA_FILTERS_NOT_READY__') {
                                    if (attempts >= 120) {
                                      clearInterval(timer);
                                      window.SitulaProgress.onPlayerStatus(token, 'cosmetic_filter_timeout', 'Brave filters did not become ready within 60 seconds.');
                                    }
                                    return;
                                  }
                                  var payload = JSON.parse(raw || '{}');
                                  var applyPayload = function() {
                                    var css = String(payload.css || '');
                                    var script = String(payload.script || '');
                                    if (css && !document.getElementById('situla-brave-cosmetic')) {
                                      var style = document.createElement('style');
                                      style.id = 'situla-brave-cosmetic';
                                      style.textContent = css;
                                      (document.head || document.documentElement || document.body).appendChild(style);
                                    }
                                    if (script && !window.__situlaBraveScriptletsApplied) {
                                      window.__situlaBraveScriptletsApplied = true;
                                      try { (0, eval)(script); }
                                      catch (scriptError) { window.SitulaProgress.onPlayerStatus(token, 'cosmetic_scriptlet_error', String(scriptError)); }
                                    }
                                    window.SitulaProgress.onPlayerStatus(token, 'cosmetic_filter_applied', 'CSS bytes: ' + css.length + '; scriptlet bytes: ' + script.length);
                                  };
                                  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyPayload, { once: true });
                                  else applyPayload();
                                  clearInterval(timer);
                                } catch (error) {
                                  window.SitulaProgress.onPlayerStatus(token, 'cosmetic_filter_error', String(error));
                                  if (attempts >= 120) clearInterval(timer);
                                }
                              }, 500);
                            })();
                        """.trimIndent().replace("__SITULA_TOKEN__", progressToken)
                        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                            runCatching {
                                WebViewCompat.addDocumentStartJavaScript(
                                    this,
                                    cosmeticInjection,
                                    setOf("https://vidlink.pro", "https://*.vidlink.pro")
                                )
                            }.onFailure {
                                reportPlayerStatus("cosmetic_injection_unavailable", it.message ?: "Could not register iframe cosmetic filter.")
                            }
                        } else {
                            reportPlayerStatus("cosmetic_injection_unsupported", "This Android System WebView does not support document-start iframe scripts.")
                        }

                        webChromeClient = object : WebChromeClient() {
                            private fun showCustomView(view: View?, callback: CustomViewCallback?) {
                                if (view == null || activity == null || fullScreenView != null) {
                                    callback?.onCustomViewHidden()
                                    return
                                }
                                val decor = activity.window.decorView as? ViewGroup
                                if (decor == null) {
                                    callback?.onCustomViewHidden()
                                    return
                                }

                                previousOrientation = activity.requestedOrientation
                                (view.parent as? ViewGroup)?.removeView(view)
                                decor.addView(
                                    view,
                                    FrameLayout.LayoutParams(
                                        ViewGroup.LayoutParams.MATCH_PARENT,
                                        ViewGroup.LayoutParams.MATCH_PARENT
                                    )
                                )
                                fullScreenView = view
                                fullScreenCallback = callback
                                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                                WindowCompat.setDecorFitsSystemWindows(activity.window, false)
                                WindowInsetsControllerCompat(activity.window, decor).apply {
                                    systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                                    hide(WindowInsetsCompat.Type.systemBars())
                                }
                            }

                            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                                showCustomView(view, callback)
                            }

                            @Suppress("DEPRECATION")
                            override fun onShowCustomView(
                                view: View?,
                                requestedOrientation: Int,
                                callback: CustomViewCallback?
                            ) {
                                showCustomView(view, callback)
                            }

                            override fun onHideCustomView() {
                                exitFullScreen()
                            }

                            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                                consoleMessage?.let {
                                    Log.d(
                                        "SitulaVidLink",
                                        "${it.message()} (line ${it.lineNumber()}, source ${it.sourceId()})"
                                    )
                                    if (it.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                                        reportPlayerStatus("javascript_error", it.message())
                                    }
                                }
                                return true
                            }

                            override fun onCreateWindow(
                                view: WebView?,
                                isDialog: Boolean,
                                isUserGesture: Boolean,
                                resultMsg: android.os.Message?
                            ): Boolean = false

                            override fun onJsAlert(
                                view: WebView?,
                                url: String?,
                                message: String?,
                                result: android.webkit.JsResult?
                            ): Boolean {
                                result?.cancel()
                                return true
                            }

                            override fun onJsConfirm(
                                view: WebView?,
                                url: String?,
                                message: String?,
                                result: android.webkit.JsResult?
                            ): Boolean {
                                result?.cancel()
                                return true
                            }

                            override fun onJsPrompt(
                                view: WebView?,
                                url: String?,
                                message: String?,
                                defaultValue: String?,
                                result: android.webkit.JsPromptResult?
                            ): Boolean {
                                result?.cancel()
                                return true
                            }
                        }

                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                                super.onPageStarted(view, url, favicon)
                                val pageUrl = url.orEmpty()
                                reportPlayerStatus("wrapper_loading", pageUrl)
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                val pageUrl = url.orEmpty()
                                if (playerStatus == "wrapper_loading") reportPlayerStatus("wrapper_ready", pageUrl)
                            }

                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                val uri = request?.url ?: return true
                                if (!uri.scheme.equals("https", ignoreCase = true)) return true

                                // Keep top-level navigation inside Situla. Before Play, let the
                                // provider iframe bootstrap normally; after Play, filter subframe
                                // document navigations as well.
                                if (!request.isForMainFrame && !braveFilterActive.get()) return false

                                if (braveFilterActive.get()) {
                                    val source = view?.url ?: "https://situla.vercel.app/"
                                    val type = if (request.isForMainFrame) "document" else "subdocument"
                                    if (BraveAdblock.shouldBlock(uri.toString(), source, type)) {
                                        reportPlayerStatus("blocked_by_brave_navigation", uri.toString())
                                        return true
                                    }
                                }
                                if (request.isForMainFrame &&
                                    !uri.host.equals("situla.vercel.app", ignoreCase = true)
                                ) return true
                                return false
                            }

                            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                                val requestedUri = request?.url ?: return null
                                if (!requestedUri.scheme.equals("https", ignoreCase = true)) {
                                    return WebResourceResponse("text/plain", "UTF-8", ByteArrayInputStream(ByteArray(0)))
                                }

                                // Before Play, allow the iframe bootstrap and poster normally.
                                // After Play, inspect all HTTPS resources, including VidLink-hosted
                                // ad paths and third-party player/media requests.
                                if (!braveFilterActive.get()) return null

                                val address = requestedUri.toString()
                                val referer = request.requestHeaders.entries.firstOrNull {
                                    it.key.equals("referer", ignoreCase = true)
                                }?.value ?: "https://vidlink.pro/"
                                val cleanUrl = address.substringBefore("?").substringBefore("#")
                                val fetchDestination = request.requestHeaders.entries.firstOrNull {
                                    it.key.equals("sec-fetch-dest", ignoreCase = true)
                                }?.value?.lowercase()
                                val accept = request.requestHeaders.entries.firstOrNull {
                                    it.key.equals("accept", ignoreCase = true)
                                }?.value.orEmpty().lowercase()
                                val requestType = when {
                                    request.isForMainFrame -> "document"
                                    fetchDestination == "iframe" || fetchDestination == "frame" ||
                                        fetchDestination == "document" -> "subdocument"
                                    fetchDestination == "script" || accept.contains("javascript") ||
                                        cleanUrl.endsWith(".js", true) -> "script"
                                    fetchDestination == "style" || accept.contains("text/css") ||
                                        cleanUrl.endsWith(".css", true) -> "stylesheet"
                                    fetchDestination == "image" || accept.contains("image/") ||
                                        cleanUrl.matches(Regex("(?i).*\\.(png|jpg|jpeg|gif|webp|svg|avif)$")) -> "image"
                                    fetchDestination == "font" ||
                                        cleanUrl.matches(Regex("(?i).*\\.(woff2?|ttf|otf)$")) -> "font"
                                    fetchDestination == "audio" || fetchDestination == "video" ||
                                        cleanUrl.matches(Regex("(?i).*\\.(mp4|m3u8|mpd|m4a|mp3|webm|m4s|ts)$")) ||
                                        accept.contains("video/") || accept.contains("audio/") -> "media"
                                    accept.contains("text/html") -> "subdocument"
                                    else -> "other"
                                }
                                if (braveFilterActive.get() && BraveAdblock.shouldBlock(address, referer, requestType)) {
                                    Log.w("SitulaVidLink", "Brave blocked $requestType request: $address")
                                    reportPlayerStatus("blocked_by_brave", "$requestType · ${requestedUri.host ?: address}")
                                    return WebResourceResponse(
                                        "text/plain",
                                        "UTF-8",
                                        ByteArrayInputStream(ByteArray(0))
                                    )
                                }
                                return null
                            }

                            override fun onReceivedHttpError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                errorResponse: android.webkit.WebResourceResponse?
                            ) {
                                val uri = request?.url ?: return
                                val code = errorResponse?.statusCode ?: 0
                                val destination = request.requestHeaders.entries.firstOrNull {
                                    it.key.equals("sec-fetch-dest", ignoreCase = true)
                                }?.value?.lowercase()
                                val importantRequest = request.isForMainFrame || isVidLinkHost(uri) ||
                                    destination in listOf("document", "iframe", "video", "audio")
                                if (code >= 400 && importantRequest) {
                                    iframeLoaded = false
                                    playerError = "Player network request returned HTTP $code for ${uri.host ?: "unknown host"}/${uri.lastPathSegment ?: "resource"}."
                                    reportPlayerStatus("http_error_$code", uri.toString())
                                    Log.w("SitulaVidLink", "HTTP $code while loading $uri")
                                }
                            }

                            override fun onReceivedError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                error: android.webkit.WebResourceError?
                            ) {
                                val uri = request?.url ?: return
                                val destination = request.requestHeaders.entries.firstOrNull {
                                    it.key.equals("sec-fetch-dest", ignoreCase = true)
                                }?.value?.lowercase()
                                val importantRequest = request.isForMainFrame || isVidLinkHost(uri) ||
                                    destination in listOf("document", "iframe", "video", "audio")
                                if (importantRequest) {
                                    val description = error?.description?.toString() ?: "Network error"
                                    iframeLoaded = false
                                    playerError = "Cannot load player request: $description (${uri.host ?: "unknown host"})."
                                    reportPlayerStatus("network_error", "$description · $uri")
                                    Log.w("SitulaVidLink", "Load error for $uri: $description")
                                }
                            }

                            override fun onReceivedSslError(
                                view: WebView?,
                                handler: SslErrorHandler?,
                                error: android.net.http.SslError?
                            ) {
                                playerError = "VidLink HTTPS certificate validation failed."
                                reportPlayerStatus("ssl_error", error?.toString().orEmpty())
                                handler?.cancel()
                            }

                            override fun onSafeBrowsingHit(
                                view: WebView?,
                                request: WebResourceRequest?,
                                threatType: Int,
                                callback: SafeBrowsingResponse?
                            ) {
                                callback?.backToSafety(true)
                            }

                            override fun onRenderProcessGone(
                                view: WebView?,
                                detail: android.webkit.RenderProcessGoneDetail?
                            ): Boolean {
                                playerError = "Android WebView player process stopped. Reload the movie page."
                                reportPlayerStatus("webview_process_gone", "Android WebView renderer exited")
                                Log.e("SitulaVidLink", "WebView render process exited")
                                return true
                            }
                        }

                        tag = playerLoadKey
                        loadDataWithBaseURL("https://situla.vercel.app/", wrapperHtml, "text/html", "UTF-8", null)
                    }
                },
                update = { webView ->
                    if (webView.tag != playerLoadKey) {
                        webView.tag = playerLoadKey
                        playerError = null
                        webView.loadDataWithBaseURL("https://situla.vercel.app/", wrapperHtml, "text/html", "UTF-8", null)
                    }
                },
                onRelease = { webView ->
                    exitFullScreen()
                    if (playerWebViewHolder[0] === webView) playerWebViewHolder[0] = null
                    webView.stopLoading()
                    webView.removeJavascriptInterface("SitulaProgress")
                    webView.destroy()
                }
            )
            if (playerError != null || !iframeLoaded) {
                Column(
                    Modifier.align(Alignment.Center)
                        .fillMaxWidth()
                        .background(Color(0xDD10141D))
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(movie.title, color = Color.White, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                    Text(
                        if (playerError == null) "Situla player frame is ready · Connecting to VidLink…" else "VidLink could not load the remote player",
                        color = if (playerError == null) Color(0xFFD7E0EA) else Color(0xFFFFB1C0),
                        modifier = Modifier.padding(top = 6.dp)
                    )
                    Text(
                        "TMDB ID: ${movie.tmdbId} · Status: $playerStatus",
                        color = Color(0xFFB8C3D1), modifier = Modifier.padding(top = 5.dp)
                    )
                    if (playerError != null) {
                        Text(playerError.orEmpty(), color = Color(0xFFFFC9A3), modifier = Modifier.padding(top = 6.dp))
                        Button(
                            onClick = {
                                iframeLoaded = false
                                playerError = null
                                playerStatus = "Retrying embedded VidLink iframe…"
                                playerDetail = playerUrl
                                playerWebViewHolder[0]?.reload()
                            },
                            modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                        ) { Text("Retry VidLink") }
                    }
                }
            }
            playerError?.let { message ->
                Column(
                    Modifier.align(Alignment.Center)
                        .fillMaxWidth()
                        .background(Color(0xEE151922))
                        .padding(12.dp)
                ) {
                    Text("PLAYER LOAD ERROR", color = Color(0xFFFFB1C0))
                    Text(message, color = Color.White, modifier = Modifier.padding(top = 4.dp))
                    Button(
                        onClick = {
                            iframeLoaded = false
                            playerError = null
                            playerStatus = "Retrying embedded iframe…"
                            playerDetail = playerUrl
                            playerWebViewHolder[0]?.reload()
                        },
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
                    ) {
                        Text("Retry iframe")
                    }
                }
            }
        }
        Column(
            Modifier.fillMaxWidth().background(Color(0xFF101319)).padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Text("VidLink diagnostics", color = Color.White)
            Text("Status: $playerStatus", color = Color(0xFFB8C3D1), modifier = Modifier.padding(top = 3.dp))
            Text(
                "TMDB ID: ${movie.tmdbId} · Mode: Embedded iframe · Brave engine: ${if (braveUiReady) "READY" else "PREPARING / UNAVAILABLE"}",
                color = Color(0xFFB8C3D1), modifier = Modifier.padding(top = 3.dp)
            )
            Text(
                "Brave request filter: ${if (braveUiActive) "ACTIVE (after Play)" else "STANDBY (player preload allowed)"}",
                color = if (braveUiActive) Color(0xFF9FE3B0) else Color(0xFFB8C3D1),
                modifier = Modifier.padding(top = 3.dp)
            )
            Text("Iframe URL: $playerUrl", color = Color(0xFF8F9BAA), modifier = Modifier.padding(top = 3.dp))
            if (!braveUiReady) {
                Text(
                    "Brave status: ${BraveAdblock.lastError ?: "Filter lists are initializing in background."}",
                    color = Color(0xFFFFC9A3), modifier = Modifier.padding(top = 3.dp)
                )
            }
            if (playerDetail.isNotBlank()) {
                Text("Detail: $playerDetail", color = Color(0xFF8F9BAA), modifier = Modifier.padding(top = 3.dp))
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Button(
                    onClick = {
                        iframeLoaded = false
                        playerError = null
                        playerDetail = playerUrl
                        playerStatus = "Retrying embedded iframe…"
                        playerWebViewHolder[0]?.reload()
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Retry iframe") }
            }
        }
    }
}
