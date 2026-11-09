package com.workrcs.situla.ui

import android.graphics.Color as AndroidColor
import android.net.Uri
import android.webkit.CookieManager
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.workrcs.situla.data.Movie
import com.workrcs.situla.data.SitulaDatabase
import com.workrcs.situla.security.BraveAdblock
import java.io.ByteArrayInputStream
import org.json.JSONObject

@Composable
fun VidLinkPlayerScreen(movie: Movie, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    val context = LocalContext.current
    val historyDao = remember { SitulaDatabase.get(context.applicationContext).watchHistoryDao() }
    val resumeSeconds = remember(movie.tmdbId) { mutableLongStateOf(0L) }

    LaunchedEffect(movie.tmdbId) {
        val saved = runCatching { historyDao.find(movie.tmdbId) }.getOrNull()
        if (saved != null && !saved.completed) resumeSeconds.longValue = (saved.positionMs / 1000L).coerceAtLeast(0L)
    }

    val playerUrl = remember(movie.tmdbId, resumeSeconds.longValue) {
        Uri.parse("https://vidlink.pro/movie/${movie.tmdbId}")
            .buildUpon()
            .appendQueryParameter("primaryColor", "B20710")
            .appendQueryParameter("icons", "default")
            .appendQueryParameter("player", "default")
            .appendQueryParameter("autoplay", "false")
            .appendQueryParameter("title", "true")
            .appendQueryParameter("poster", "true")
            .apply { if (resumeSeconds.longValue > 0L) appendQueryParameter("startAt", resumeSeconds.longValue.toString()) }
            .build().toString()
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
                        webChromeClient = object : WebChromeClient() {
                            override fun onCreateWindow(
                                view: WebView?,
                                isDialog: Boolean,
                                isUserGesture: Boolean,
                                resultMsg: android.os.Message?
                            ): Boolean = false
                        }
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                val uri = request?.url ?: return true
                                return uri.scheme != "https"
                            }

                            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                                val address = request?.url?.toString() ?: return null
                                val referer = request.requestHeaders.entries.firstOrNull {
                                    it.key.equals("referer", ignoreCase = true)
                                }?.value ?: "https://vidlink.pro/"
                                val cleanUrl = address.substringBefore("?")
                                val requestType = when {
                                    request.isForMainFrame -> "document"
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

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                val pageUrl = url ?: return
                                if (!pageUrl.startsWith("https://vidlink.pro/")) return
                                val payload = runCatching { JSONObject(BraveAdblock.cosmeticPayload(pageUrl)) }.getOrNull() ?: return
                                val css = payload.optString("css")
                                val script = payload.optString("script")
                                val js = """
                                    (function() {
                                      try {
                                        var style = document.getElementById('__situla_adblock_css');
                                        if (!style) {
                                          style = document.createElement('style');
                                          style.id = '__situla_adblock_css';
                                          (document.head || document.documentElement).appendChild(style);
                                        }
                                        style.textContent = ${JSONObject.quote(css)};
                                        ${script}
                                      } catch (_) {}
                                    })();
                                """.trimIndent()
                                view?.evaluateJavascript(js, null)
                            }
                        }
                        loadUrl(playerUrl)
                    }
                },
                update = { webView ->
                    if (webView.url != playerUrl) webView.loadUrl(playerUrl)
                }
            )
        }
    }
}