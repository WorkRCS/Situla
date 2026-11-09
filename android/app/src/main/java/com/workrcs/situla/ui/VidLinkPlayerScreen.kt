package com.workrcs.situla.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.graphics.Color as AndroidColor
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.workrcs.situla.data.Movie

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

    var fullScreenView by remember { mutableStateOf<View?>(null) }
    var playerWebView by remember(movie.imdbId) { mutableStateOf<WebView?>(null) }
    var fullScreenCallback by remember { mutableStateOf<WebChromeClient.CustomViewCallback?>(null) }
    var previousOrientation by remember { mutableStateOf(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED) }

    fun exitFullScreen() {
        val view = fullScreenView ?: return
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

    BackHandler(enabled = !embedded && fullScreenView == null) {
        val webView = playerWebView
        if (webView?.canGoBack() == true) webView.goBack() else onBack()
    }
    BackHandler(enabled = fullScreenView != null, onBack = { exitFullScreen() })
    DisposableEffect(activity) { onDispose { exitFullScreen() } }

    val playerUrl = remember(movie.imdbId) {
        if (movie.imdbId.matches(Regex("^tt\\d{5,12}$", RegexOption.IGNORE_CASE))) "https://vidlink.pro/movie/${movie.imdbId}" else null
    }
    val boxModifier = if (embedded) {
        Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)
    } else {
        Modifier.fillMaxSize().background(Color.Black)
    }

    if (playerUrl == null) {
        Box(modifier = boxModifier, contentAlignment = Alignment.Center) {
            Text("Playback is unavailable for this IMDb title.", color = Color.White)
        }
        return
    }

    Box(modifier = boxModifier) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                WebView(viewContext).apply {
                    tag = movie.imdbId
                    setBackgroundColor(AndroidColor.BLACK)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = false
                    settings.userAgentString = settings.userAgentString.replace("; wv", "")
                    settings.loadsImagesAutomatically = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.setSupportMultipleWindows(false)
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                    playerWebView = this
                    webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(
                            view: WebView?,
                            request: android.webkit.WebResourceRequest?
                        ): android.webkit.WebResourceResponse? {
                            val uri = request?.url ?: return null
                            if (NetworkAdBlocker.shouldBlock(uri)) return NetworkAdBlocker.emptyResponse()
                            return super.shouldInterceptRequest(view, request)
                        }

                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: android.webkit.WebResourceRequest?
                        ): Boolean {
                            val uri = request?.url ?: return true
                            if (NetworkAdBlocker.shouldBlock(uri)) return true
                            if (!request.isForMainFrame && request.hasGesture() &&
                                !NetworkAdBlocker.isTrustedPlayerFrameNavigation(uri)
                            ) return true
                            return request.isForMainFrame && !NetworkAdBlocker.isTrustedTopLevel(uri)
                        }
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onCreateWindow(
                            view: WebView?,
                            isDialog: Boolean,
                            isUserGesture: Boolean,
                            resultMsg: android.os.Message?
                        ): Boolean = false

                        private fun showPlayerFullScreen(view: View?, callback: CustomViewCallback?) {
                            val host = activity
                            val decor = host?.window?.decorView as? ViewGroup
                            if (view == null || host == null || decor == null || fullScreenView != null) {
                                callback?.onCustomViewHidden()
                                return
                            }
                            previousOrientation = host.requestedOrientation
                            (view.parent as? ViewGroup)?.removeView(view)
                            decor.addView(view, FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            ))
                            fullScreenView = view
                            fullScreenCallback = callback
                            host.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                            WindowCompat.setDecorFitsSystemWindows(host.window, false)
                            WindowInsetsControllerCompat(host.window, decor).apply {
                                systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                                hide(WindowInsetsCompat.Type.systemBars())
                            }
                        }

                        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                            showPlayerFullScreen(view, callback)
                        }

                        @Suppress("DEPRECATION")
                        override fun onShowCustomView(view: View?, requestedOrientation: Int, callback: CustomViewCallback?) {
                            showPlayerFullScreen(view, callback)
                        }

                        override fun onHideCustomView() {
                            exitFullScreen()
                        }
                    }
                    loadUrl(playerUrl)
                }
            },
            update = { webView ->
                val nextId = movie.imdbId
                val currentId = webView.tag as? String
                if (currentId != nextId) {
                    webView.tag = nextId
                    webView.loadUrl(playerUrl)
                }
            },
            onRelease = { webView ->
                if (playerWebView === webView) playerWebView = null
                exitFullScreen()
                webView.stopLoading()
                webView.destroy()
            }
        )
    }
}
