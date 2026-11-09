package com.workrcs.situla.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color as AndroidColor
import android.net.VpnService
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import com.workrcs.situla.vpn.VpnProfileStore
import com.workrcs.situla.vpn.WireGuardVpnManager
import kotlinx.coroutines.launch
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
    val appContext = remember(context) { context.applicationContext }
    val vpnScope = rememberCoroutineScope()
    var showVpnSettings by remember { mutableStateOf(false) }
    var pendingAutoConnect by remember { mutableStateOf<Pair<String, String>?>(null) }

    fun connectAutoProfile(profile: Pair<String, String>) {
        vpnScope.launch {
            runCatching {
                WireGuardVpnManager.connect(appContext, profile.first, profile.second)
                if (VpnProfileStore.autoRotateEnabled(appContext) &&
                    VpnProfileStore.availableRegions(appContext).size >= 2
                ) {
                    WireGuardVpnManager.startAutoRotation(appContext)
                }
            }
        }
    }

    val vpnPermissionLauncher = rememberLauncherForActivityResult(StartActivityForResult()) { result ->
        val profile = pendingAutoConnect
        pendingAutoConnect = null
        if (result.resultCode == Activity.RESULT_OK && profile != null) {
            connectAutoProfile(profile)
        }
    }

    LaunchedEffect(appContext) {
        if (VpnProfileStore.autoConnectEnabled(appContext)) {
            val region = VpnProfileStore.preferredAvailableRegion(appContext)
            val profile = region?.let { VpnProfileStore.load(appContext, it) }
            if (region != null && profile != null) {
                val permission = VpnService.prepare(appContext)
                if (permission == null) {
                    connectAutoProfile(region to profile)
                } else {
                    pendingAutoConnect = region to profile
                    vpnPermissionLauncher.launch(permission)
                }
            }
        }
    }

    DisposableEffect(appContext) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) WireGuardVpnManager.disconnectOnBackground()
        }
        ProcessLifecycleOwner.get().lifecycle.addObserver(observer)
        onDispose { ProcessLifecycleOwner.get().lifecycle.removeObserver(observer) }
    }
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

    Box(modifier = Modifier.fillMaxSize()) {
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
                        // Keep all player subframes and media-source navigation available.
                        // Known ad/tracker requests are filtered above by shouldInterceptRequest.
                        // Only block untrusted top-level navigations outside Situla/player pages.
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
                    // VidLink is embedded without iframe sandboxing for player compatibility.
                    // Keep native WebView popups/new windows disabled so ad clicks cannot
                    // open a second WebView or escape the Situla host.
                    override fun onCreateWindow(
                        view: WebView?,
                        isDialog: Boolean,
                        isUserGesture: Boolean,
                        resultMsg: android.os.Message?
                    ): Boolean = false

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

      Button(
          onClick = { showVpnSettings = true },
          modifier = Modifier.align(Alignment.TopEnd).padding(12.dp)
      ) {
          Text("VPN")
      }

      if (showVpnSettings) {
          Dialog(
              onDismissRequest = { showVpnSettings = false },
              properties = DialogProperties(usePlatformDefaultWidth = false)
          ) {
              Column(
                  Modifier.fillMaxWidth(0.96f)
                      .heightIn(max = 720.dp)
                      .verticalScroll(rememberScrollState())
              ) {
                  SitulaVpnControls(context = appContext, onClose = { showVpnSettings = false })
              }
          }
      }
    }
}
