package com.workrcs.situla.vpn

import android.content.Context
import java.io.File

object VpnProfileStore {
    val regions = listOf("Singapore", "Malaysia", "Japan", "Germany", "Netherlands", "Poland")
    private const val PREFERENCES = "situla_vpn_preferences"

    fun autoConnectEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean("auto_connect_enabled", false)

    fun autoConnectRegion(context: Context): String? =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString("auto_connect_region", regions.first())
            ?.takeIf { it in regions }

    fun setAutoConnectRegion(context: Context, region: String?) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().apply {
            if (region == null) {
                putBoolean("auto_connect_enabled", false)
            } else {
                require(region in regions)
                putBoolean("auto_connect_enabled", true)
                putString("auto_connect_region", region)
            }
        }.apply()
    }

    fun preferredAvailableRegion(context: Context): String? {
        val available = availableRegions(context)
        if (available.isEmpty()) return null
        // Prefer the region with the lowest previously measured live tunnel latency.
        // On a first run, fall back to the selected default region, then the first profile.
        val measured = regionLatencies(context)
        val fastestMeasured = available
            .filter { measured[it] != null }
            .minByOrNull { measured[it] ?: Long.MAX_VALUE }
        return fastestMeasured
            ?: autoConnectRegion(context)?.takeIf { it in available }
            ?: available.firstOrNull()
    }

    fun regionLatencies(context: Context): Map<String, Long> {
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        return regions.mapNotNull { region ->
            preferences.getLong("latency_ms_${region.lowercase()}", -1L)
                .takeIf { it > 0L }
                ?.let { region to it }
        }.toMap()
    }

    fun saveRegionLatency(context: Context, region: String, latencyMs: Long) {
        require(region in regions)
        require(latencyMs > 0L)
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putLong("latency_ms_${region.lowercase()}", latencyMs)
            .apply()
    }

    fun autoRotateEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean("auto_rotate_enabled", false)

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
            Regex("(?im)^AllowedIPs\\s*=.*$").replaceFirst(
                peerBody,
                "AllowedIPs = 0.0.0.0/0, ::/0"
            )
        } else {
            peerBody.trimEnd() + "\nAllowedIPs = 0.0.0.0/0, ::/0\n"
        }

        val withAutomaticRoutes = rawProfile.substring(0, peerStart) +
            peerBodyWithRoutes + peerTail.substring(nextSection)
        val dnsLine = "DNS = 94.140.14.14, 94.140.15.15"
        val dnsRegex = Regex("(?im)^DNS\\s*=.*$")
        val withDns = if (dnsRegex.containsMatchIn(withAutomaticRoutes)) {
            dnsRegex.replaceFirst(withAutomaticRoutes, dnsLine)
        } else {
            val interfaceHeader = Regex("(?im)^\\s*\\[Interface]\\s*$")
            val interfaceMatch = interfaceHeader.find(withAutomaticRoutes)
                ?: error("WireGuard profile has no [Interface] section.")
            val insertAt = interfaceMatch.range.last + 1
            withAutomaticRoutes.substring(0, insertAt) +
                "\n" + dnsLine +
                withAutomaticRoutes.substring(insertAt)
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