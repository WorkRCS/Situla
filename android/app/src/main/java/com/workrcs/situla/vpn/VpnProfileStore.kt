package com.workrcs.situla.vpn

import android.content.Context
import java.io.File

object VpnProfileStore {
    val regions = listOf("Malaysia", "Singapore", "Japan", "Germany")
    private const val PREFERENCES = "situla_vpn_preferences"

    fun autoConnectRegion(context: Context): String? =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString("auto_connect_region", null)
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
            .getBoolean("auto_rotate_enabled", false)

    fun setAutoRotateEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit().putBoolean("auto_rotate_enabled", enabled).apply()
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