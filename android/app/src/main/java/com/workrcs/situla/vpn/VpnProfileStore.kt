package com.workrcs.situla.vpn

import android.content.Context
import java.io.File

object VpnProfileStore {
    val regions = listOf("Malaysia", "Singapore", "Japan", "Germany")
    private const val PREFERENCES = "situla_vpn_preferences"

    fun autoConnectRegion(context: Context): String? =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString("auto_connect_region", regions.first())
            ?.takeIf { it in regions }

    fun setAutoConnectRegion(context: Context, region: String?) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().apply {
            if (region == null) remove("auto_connect_region")
            else {
                require(region in regions)
                putString("auto_connect_region", region)
            }
        }.apply()
    }

    fun autoRotateEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean("auto_rotate_enabled", true)

    fun setAutoRotateEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit().putBoolean("auto_rotate_enabled", enabled).apply()
    }

    fun prepareFullTunnelProfile(rawProfile: String): String {
        require(rawProfile.isNotBlank()) { "WireGuard profile is empty." }
        require(Regex("(?im)^\\s*\\[Interface]\\s*$").containsMatchIn(rawProfile)) {
            "WireGuard profile has no [Interface] section."
        }
        require(Regex("(?im)^\\s*\\[Peer]\\s*$").findAll(rawProfile).count() == 1) {
            "A single-peer WireGuard profile is required for automatic IP routing."
        }

        val peerHeader = Regex("(?im)^\\s*\\[Peer]\\s*$")
        val peerStart = peerHeader.find(rawProfile)?.range?.last?.plus(1)
            ?: error("WireGuard profile has no [Peer] section.")
        val peerTail = rawProfile.substring(peerStart)
        val nextSection = Regex("(?im)^\\s*\\[").find(peerTail)?.range?.first ?: peerTail.length
        val peerBody = peerTail.substring(0, nextSection)
        val peerBodyWithRoutes = if (Regex("(?im)^AllowedIPs\\s*=.*$").containsMatchIn(peerBody)) {
            Regex("(?im)^AllowedIPs\\s*=.*$").replace(
                peerBody,
                "AllowedIPs = 0.0.0.0/0, ::/0",
                limit = 1
            )
        } else {
            peerBody.trimEnd() + "\nAllowedIPs = 0.0.0.0/0, ::/0\\n"
        }

        val withAutomaticRoutes = rawProfile.substring(0, peerStart) +
            peerBodyWithRoutes + peerTail.substring(nextSection)
        val dnsLine = "DNS = 94.140.14.14, 94.140.15.15"
        val dnsRegex = Regex("(?im)^DNS\\s*=.*$")
        val withDns = if (dnsRegex.containsMatchIn(withAutomaticRoutes)) {
            dnsRegex.replace(withAutomaticRoutes, dnsLine, limit = 1)
        } else {
            val interfaceHeader = Regex("(?im)^\\s*\\[Interface]\\s*$")
            interfaceHeader.replaceFirst(withAutomaticRoutes) { "${it.value}\n$dnsLine" }
        }
        val parsed = com.wireguard.config.Config.parse(withDns.byteInputStream(Charsets.UTF_8))
        require(parsed.peers.size == 1 && parsed.peers.single().endpoint.isPresent) {
            "WireGuard profile must include one peer with an Endpoint."
        }
        return withDns
    }

    private fun profileFile(context: Context, region: String): File {
        require(region in regions) { "Unknown VPN region." }
        val directory = File(context.noBackupFilesDir, "wireguard-profiles").apply { mkdirs() }
        return File(directory, region.lowercase() + ".conf")
    }

    fun save(context: Context, region: String, profile: String) {
        require(profile.isNotBlank()) { "The WireGuard profile is empty." }
        profileFile(context, region).writeText(profile, Charsets.UTF_8)
    }

    fun load(context: Context, region: String): String? =
        profileFile(context, region).takeIf { it.exists() }?.readText(Charsets.UTF_8)

    fun hasProfile(context: Context, region: String): Boolean =
        profileFile(context, region).let { it.exists() && it.length() > 0L }

    fun availableRegions(context: Context): List<String> =
        regions.filter { hasProfile(context, it) }
}