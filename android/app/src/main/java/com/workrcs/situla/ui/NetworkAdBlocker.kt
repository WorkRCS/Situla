package com.workrcs.situla.ui

import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.util.Locale

/**
 * Best-effort request filtering for the Android WebView.
 *
 * The list targets known ad/affiliate/measurement request hosts only. Other
 * player frame/source hosts are allowed so provider playback can resolve normally.
 */
object NetworkAdBlocker {
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

    fun shouldBlock(uri: Uri): Boolean {
        val host = uri.host?.lowercase(Locale.ROOT)?.trimEnd('.') ?: return false
        return blockedDomains.any { domain -> host == domain || host.endsWith(".$domain") }
    }

    fun isTrustedTopLevel(uri: Uri): Boolean {
        val host = uri.host?.lowercase(Locale.ROOT)?.trimEnd('.') ?: return false
        return host == "situla.vercel.app" ||
            host == "vidlink.pro" ||
            host.endsWith(".vidlink.pro") ||
            host == "localhost" ||
            host == "10.0.2.2"
    }

    fun emptyResponse(): WebResourceResponse =
        WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
}
