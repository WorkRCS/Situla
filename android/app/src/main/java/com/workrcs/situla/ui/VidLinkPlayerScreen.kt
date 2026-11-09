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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
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
import kotlinx.coroutines.delay
import org.json.JSONObject

private class VidLinkProgressBridge(
    private val movie: Movie,
    private val dao: WatchHistoryDao,
    initialPositionMs: Long,
    private val bridgeToken: String,
    private val reportStatus: (String, String) -> Unit
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
    var playerStatus by remember(movie.tmdbId) { mutableStateOf("Preparing VidLink player…") }
    var playerDetail by remember(movie.tmdbId) { mutableStateOf("") }
    var iframeLoaded by remember(movie.tmdbId) { mutableStateOf(false) }
    var directPlayerMode by remember(movie.tmdbId) { mutableStateOf(false) }
    val directPlayerModeHolder = remember(movie.tmdbId) { booleanArrayOf(false) }
    directPlayerModeHolder[0] = directPlayerMode
    val mainThreadHandler = remember { Handler(Looper.getMainLooper()) }
    val reportPlayerStatus: (String, String) -> Unit = { status, detail ->
        mainThreadHandler.post {
            playerStatus = status
            if (detail.isNotBlank()) playerDetail = detail
            if (status == "iframe_loaded") iframeLoaded = true
            if (status == "iframe_error") playerError = "VidLink iframe failed to load. $detail"
        }
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

    val protectionReady = produceState(initialValue = BraveAdblock.ready) {
        value = if (BraveAdblock.ready) true else
            com.workrcs.situla.security.AdblockFilterRepository.refreshAndInitialize(context.applicationContext)
    }

    if (!protectionReady.value) {
        Column(
            (if (embedded) Modifier.fillMaxWidth().aspectRatio(16f / 9f) else Modifier.fillMaxSize())
                .background(Color.Black).padding(20.dp)
        ) {
            Text(
                "Situla protection could not initialize. The player is blocked until the request filter is ready.",
                color = Color.White
            )
            Text(
                BraveAdblock.lastError ?: "Filter lists could not be loaded or the native engine returned false.",
                color = Color(0xFFFFB1C0),
                modifier = Modifier.padding(top = 8.dp)
            )
            if (!embedded) {
                Button(onClick = onBack, modifier = Modifier.padding(top = 14.dp)) {
                    Text("Back to movie details")
                }
            }
        }
        return
    }

    val resumePositionMs = remember(movie.tmdbId) { androidx.compose.runtime.mutableLongStateOf(0L) }
    val progressToken = remember(movie.tmdbId) { java.util.UUID.randomUUID().toString() }
    val progressBridge = remember(movie.tmdbId, progressToken) {
        VidLinkProgressBridge(movie, dao, 0L, progressToken, reportPlayerStatus)
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

    LaunchedEffect(playerUrl, directPlayerMode) {
        if (directPlayerMode) return@LaunchedEffect
        delay(12_000)
        if (!iframeLoaded && !directPlayerMode) {
            playerStatus = "Iframe did not report a load within 12 seconds; switching to direct player page."
            playerDetail = playerUrl
            directPlayerMode = true
        }
    }

    val playerLoadKey = "$playerUrl|${if (directPlayerMode) "direct" else "iframe"}"

    val wrapperHtml = remember(playerUrl, progressToken) {
        """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
          <meta charset="utf-8">
          <style>
            html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; }
            iframe { display:block; border:0; width:100%; height:100%; background:#000; }
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
              frame.addEventListener('load', function() {
                iframeSignaled = true;
                report('iframe_loaded', frame.src);
              });
              frame.addEventListener('error', function() {
                iframeSignaled = true;
                report('iframe_error', frame.src);
              });
              setTimeout(function() {
                if (!iframeSignaled) report('iframe_wait_timeout', frame.src);
              }, 11000);
              window.addEventListener('message', function(event) {
                if (event.origin !== 'https://vidlink.pro') return;
                var payload = event.data || {};
                if (payload.type === 'PLAYER_EVENT' && payload.data) {
                  var player = payload.data;
                  report('vidlink_player_event', String(player.event || 'player event'));
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
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { viewContext ->
                    WebView(viewContext).apply {
                        playerWebViewHolder[0] = this
                        setBackgroundColor(AndroidColor.BLACK)
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
                        // VidLink is intentionally loaded as a third-party iframe. Some
                        // providers require third-party cookies/storage for player bootstrap.
                        // Brave filtering still applies to third-party network requests.
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        addJavascriptInterface(progressBridge, "SitulaProgress")

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
                                val isDirectVidLink = directPlayerModeHolder[0] &&
                                    runCatching { isVidLinkHost(Uri.parse(pageUrl)) }.getOrDefault(false)
                                reportPlayerStatus(if (isDirectVidLink) "direct_page_loading" else "wrapper_loading", pageUrl)
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                val pageUrl = url.orEmpty()
                                val isDirectVidLink = directPlayerModeHolder[0] &&
                                    runCatching { isVidLinkHost(Uri.parse(pageUrl)) }.getOrDefault(false)
                                reportPlayerStatus(if (isDirectVidLink) "direct_page_loaded" else "wrapper_ready", pageUrl)
                            }

                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                val uri = request?.url ?: return true
                                if (!uri.scheme.equals("https", ignoreCase = true)) return true

                                // Permit VidLink as an iframe, or as the explicit direct-page
                                // fallback. Other top-level destinations remain blocked.
                                if (!request.isForMainFrame && isVidLinkHost(uri)) return false
                                if (request.isForMainFrame && directPlayerModeHolder[0] && isVidLinkHost(uri)) return false

                                val source = view?.url ?: "https://situla.vercel.app/"
                                val type = if (request.isForMainFrame) "document" else "subdocument"
                                if (BraveAdblock.shouldBlock(uri.toString(), source, type)) return true
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

                                // Do not let EasyList/EasyPrivacy accidentally block VidLink's
                                // own app shell, player scripts, or player API endpoints. All
                                // cross-site ad/tracker/media hosts continue through Brave.
                                if (isVidLinkHost(requestedUri)) return null

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
                                if (BraveAdblock.shouldBlock(address, referer, requestType)) {
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
                                if (code >= 400 && (request.isForMainFrame || isVidLinkHost(uri))) {
                                    playerError = "Player request returned HTTP $code for ${uri.host ?: "unknown host"}/${uri.lastPathSegment ?: "resource"}."
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
                                if (request.isForMainFrame || isVidLinkHost(uri)) {
                                    val description = error?.description?.toString() ?: "Network error"
                                    playerError = "Cannot load player page: $description"
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
                        if (directPlayerMode) loadUrl(playerUrl)
                        else loadDataWithBaseURL("https://situla.vercel.app/", wrapperHtml, "text/html", "UTF-8", null)
                    }
                },
                update = { webView ->
                    if (webView.tag != playerLoadKey) {
                        webView.tag = playerLoadKey
                        playerError = null
                        if (directPlayerMode) webView.loadUrl(playerUrl)
                        else webView.loadDataWithBaseURL("https://situla.vercel.app/", wrapperHtml, "text/html", "UTF-8", null)
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
            playerError?.let { message ->
                Column(
                    Modifier.fillMaxWidth().background(Color(0xEE151922)).padding(10.dp)
                ) {
                    Text(message, color = Color.White)
                    Button(
                        onClick = {
                            playerError = null
                            playerWebViewHolder[0]?.reload()
                        },
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
                    ) {
                        Text("Reload player")
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
                "TMDB ID: ${movie.tmdbId} · Mode: ${if (directPlayerMode) "Direct page" else "Iframe"}",
                color = Color(0xFFB8C3D1), modifier = Modifier.padding(top = 3.dp)
            )
            if (playerDetail.isNotBlank()) {
                Text("Detail: $playerDetail", color = Color(0xFF8F9BAA), modifier = Modifier.padding(top = 3.dp))
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Button(
                    onClick = {
                        iframeLoaded = false
                        directPlayerMode = true
                        playerError = null
                        playerDetail = playerUrl
                        playerStatus = "Opening VidLink directly inside the app…"
                    },
                    modifier = Modifier.weight(1f).padding(end = 4.dp)
                ) { Text("Direct player") }
                Button(
                    onClick = {
                        iframeLoaded = false
                        directPlayerMode = false
                        playerError = null
                        playerDetail = ""
                        playerStatus = "Retrying embedded iframe…"
                    },
                    modifier = Modifier.weight(1f).padding(start = 4.dp)
                ) { Text("Retry iframe") }
            }
        }
    }
}
