package com.workrcs.situla.vpn

import android.content.Context
import java.io.File

object VpnProfileStore {
    val regions = listOf("Malaysia", "Singapore", "Japan", "Germany")

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