package com.workrcs.situla.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

private const val SITULA_WEBSITE_URL = "https://situla.vercel.app/"

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/**
 * Native Android WebView wrapper for the hosted Situla website.
 * No PWA install flow or separate native movie UI: the website owns
 * all pages, navigation, search and playback.
 */
@Composable
fun SitulaApp(context: Context) {
    val activity = remember(context) { context.findActivity() }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var fullScreenView by remember { mutableStateOf<View?>(null) }
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

    BackHandler(enabled = true) {
        when {
            fullScreenView != null -> exitFullScreen()
            webView?.canGoBack() == true -> webView?.goBack()
            else -> activity?.finish()
        }
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { viewContext ->
            WebView(viewContext).apply {
                webView = this
                setBackgroundColor(AndroidColor.rgb(8, 9, 14))
                isFocusable = true
                isFocusableInTouchMode = true

                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    loadsImagesAutomatically = true
                    mediaPlaybackRequiresUserGesture = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    // Do not let player scripts spawn ad tabs/windows.
                    javaScriptCanOpenWindowsAutomatically = false
                    setSupportMultipleWindows(false)
                    allowFileAccess = false
                    allowContentAccess = false
                    useWideViewPort = true
                    loadWithOverviewMode = false
                    cacheMode = WebSettings.LOAD_DEFAULT
                    userAgentString = userAgentString.replace("; wv", "")
                }

                val cookieManager = CookieManager.getInstance()
                cookieManager.setAcceptCookie(true)
                cookieManager.setAcceptThirdPartyCookies(this, true)

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
                        if (request.isForMainFrame && !NetworkAdBlocker.isTrustedTopLevel(uri)) return true
                        return when (uri.scheme?.lowercase()) {
                            "http", "https", "about", "javascript", "blob" -> false
                            "mailto", "tel" -> {
                                runCatching { viewContext.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                                true
                            }
                            else -> true
                        }
                    }
                }

                webChromeClient = object : WebChromeClient() {
                    private fun showFullScreen(view: View?, callback: CustomViewCallback?) {
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
                            systemBarsBehavior =
                                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                            hide(WindowInsetsCompat.Type.systemBars())
                        }
                    }

                    override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                        showFullScreen(view, callback)
                    }

                    @Suppress("DEPRECATION")
                    override fun onShowCustomView(
                        view: View?,
                        requestedOrientation: Int,
                        callback: CustomViewCallback?
                    ) {
                        showFullScreen(view, callback)
                    }

                    override fun onHideCustomView() {
                        exitFullScreen()
                    }
                }

                loadUrl(SITULA_WEBSITE_URL)
            }
        },
        update = { view ->
            if (webView !== view) webView = view
        },
        onRelease = { view ->
            if (webView === view) webView = null
            exitFullScreen()
            view.stopLoading()
            view.destroy()
        }
    )
}
