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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
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
    var playerWebView by remember(movie.tmdbId) { mutableStateOf<WebView?>(null) }
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

    // Behave like a browser-wrapped website: navigate within VidLink first,
    // then return to Situla's catalog when there is no page history left.
    BackHandler(enabled = !embedded && fullScreenView == null) {
        val webView = playerWebView
        if (webView?.canGoBack() == true) {
            webView.goBack()
        } else {
            onBack()
        }
    }
    BackHandler(enabled = fullScreenView != null, onBack = { exitFullScreen() })

    DisposableEffect(activity) {
        onDispose { exitFullScreen() }
    }

    // The API supplies the TMDB ID; the app opens the provider page directly.
    val playerUrl = remember(movie.tmdbId) { "https://vidlink.pro/movie/${movie.tmdbId}" }

    Box(
        modifier = if (embedded) {
            Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)
        } else {
            Modifier.fillMaxSize().background(Color.Black)
        }
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                WebView(viewContext).apply {
                    tag = movie.tmdbId
                    setBackgroundColor(AndroidColor.BLACK)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = false
                    // Present a regular mobile-browser UA to sites that serve
                    // a limited layout to embedded Android WebViews.
                    settings.userAgentString = settings.userAgentString.replace("; wv", "")
                    settings.loadsImagesAutomatically = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    // Keep JavaScript popups disabled; multiple windows remain off below.
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
                            return request.isForMainFrame && !NetworkAdBlocker.isTrustedTopLevel(uri)
                        }
                    }
                    webChromeClient = object : WebChromeClient() {
                        private fun showPlayerFullScreen(view: View?, callback: CustomViewCallback?) {
                            val host = activity
                            val decor = host?.window?.decorView as? ViewGroup
                            if (view == null || host == null || decor == null || fullScreenView != null) {
                                callback?.onCustomViewHidden()
                                return
                            }

                            previousOrientation = host.requestedOrientation
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
                        override fun onShowCustomView(
                            view: View?,
                            requestedOrientation: Int,
                            callback: CustomViewCallback?
                        ) {
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
                val currentId = webView.tag as? Int
                if (currentId != movie.tmdbId) {
                    webView.tag = movie.tmdbId
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
