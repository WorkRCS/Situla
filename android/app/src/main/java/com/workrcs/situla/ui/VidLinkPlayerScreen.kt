package com.workrcs.situla.ui

import android.content.Context
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.os.SystemClock
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
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

private class VidLinkProgressBridge(
    private val movie: Movie,
    private val dao: WatchHistoryDao,
    initialPositionMs: Long,
    private val bridgeToken: String
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

private fun htmlAttribute(value: String): String =
    value.replace("&", "&amp;")
        .replace("\"", "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")

@Composable
fun VidLinkPlayerScreen(movie: Movie, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    val context = LocalContext.current
    val dao = remember { SitulaDatabase.get(context.applicationContext).watchHistoryDao() }
    val protectionReady = produceState(initialValue = BraveAdblock.ready) {
        value = if (BraveAdblock.ready) true else
            com.workrcs.situla.security.AdblockFilterRepository.refreshAndInitialize(context.applicationContext)
    }

    if (!protectionReady.value) {
        Column(Modifier.fillMaxSize().background(Color.Black).padding(20.dp)) {
            Text("Situla protection is not ready. The player is paused so video loads are not sent without the ad/malware filter.")
            Button(onClick = onBack, modifier = Modifier.padding(top = 14.dp)) {
                Text("Back to movie details")
            }
        }
        return
    }
    val resumePositionMs = remember(movie.tmdbId) { androidx.compose.runtime.mutableLongStateOf(0L) }
    val progressToken = remember(movie.tmdbId) { java.util.UUID.randomUUID().toString() }
    val progressBridge = remember(movie.tmdbId) {
        VidLinkProgressBridge(movie, dao, 0L, progressToken)
    }

    LaunchedEffect(movie.tmdbId) {
        val saved = runCatching { dao.find(movie.tmdbId) }.getOrNull()
        if (saved != null && !saved.completed) {
            resumePositionMs.longValue = saved.positionMs.coerceAtLeast(0L)
            progressBridge.resetResumePosition(saved.positionMs, saved.watchedMs)
        }
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
                  allow="autoplay; fullscreen; picture-in-picture"
                  referrerpolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  allowfullscreen></iframe>
          <script>
            (function() {
              'use strict';
              window.addEventListener('message', function(event) {
                if (event.origin !== 'https://vidlink.pro') return;
                var payload = event.data || {};
                if (payload.type === 'PLAYER_EVENT' && payload.data) {
                  var player = payload.data;
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

    Column(Modifier.fillMaxSize().background(Color.Black)) {
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth().padding(8.dp)) {
            Text("Back to movie details")
        }
        Box(Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { viewContext ->
                    WebView(viewContext).apply {
                        setBackgroundColor(AndroidColor.BLACK)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = true
                        settings.javaScriptCanOpenWindowsAutomatically = false
                        settings.setSupportMultipleWindows(false)
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        settings.safeBrowsingEnabled = true
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                        addJavascriptInterface(progressBridge, "SitulaProgress")

                        webChromeClient = object : WebChromeClient() {
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
                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                val uri = request?.url ?: return true
                                if (!uri.scheme.equals("https", ignoreCase = true)) return true
                                val source = view?.url ?: "https://situla.invalid/"
                                val type = if (request.isForMainFrame) "document" else "subdocument"
                                if (BraveAdblock.shouldBlock(uri.toString(), source, type)) return true
                                if (request.isForMainFrame &&
                                    !uri.host.equals("situla.invalid", ignoreCase = true) &&
                                    !uri.host.equals("vidlink.pro", ignoreCase = true)
                                ) return true
                                false
                            }

                            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                                val address = request?.url?.toString() ?: return null
                                val referer = request.requestHeaders.entries.firstOrNull {
                                    it.key.equals("referer", ignoreCase = true)
                                }?.value ?: "https://vidlink.pro/"
                                val cleanUrl = address.substringBefore("?")
                                val fetchDestination = request.requestHeaders.entries.firstOrNull {
                                    it.key.equals("sec-fetch-dest", ignoreCase = true)
                                }?.value?.lowercase()
                                val requestType = when {
                                    request.isForMainFrame -> "document"
                                    fetchDestination == "iframe" || fetchDestination == "frame" -> "subdocument"
                                    cleanUrl.endsWith(".js", true) -> "script"
                                    cleanUrl.endsWith(".css", true) -> "stylesheet"
                                    cleanUrl.matches(Regex("(?i).*\\.(mp4|m3u8|mpd|m4a|mp3|webm)$")) -> "media"
                                    cleanUrl.matches(Regex("(?i).*\\.(png|jpg|jpeg|gif|webp|svg|avif)$")) -> "image"
                                    cleanUrl.matches(Regex("(?i).*\\.(woff2?|ttf|otf)$")) -> "font"
                                    else -> "other"
                                }
                                if (BraveAdblock.shouldBlock(address, referer, requestType)) {
                                    return WebResourceResponse(
                                        "text/plain",
                                        "UTF-8",
                                        ByteArrayInputStream(ByteArray(0))
                                    )
                                }
                                return null
                            }
                        }

                        tag = playerUrl
                        loadDataWithBaseURL("https://situla.invalid/", wrapperHtml, "text/html", "UTF-8", null)
                    }
                },
                update = { webView ->
                    if (webView.tag != playerUrl) {
                        webView.tag = playerUrl
                        webView.loadDataWithBaseURL("https://situla.invalid/", wrapperHtml, "text/html", "UTF-8", null)
                    }
                },
                onRelease = { webView ->
                    webView.stopLoading()
                    webView.removeJavascriptInterface("SitulaProgress")
                    webView.destroy()
                }
            )
        }
    }
}
