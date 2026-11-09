package com.workrcs.situla.vpn

import android.content.Context
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class SitulaVpnState(
    val connected: Boolean = false,
    val connecting: Boolean = false,
    val region: String? = null,
    val message: String = "VPN disconnected"
)

/**
 * WireGuard tunnel controller.
 * VPN keys stay in the app's private no-backup files; never put profiles in the backend or APK.
 */
object WireGuardVpnManager {
    private val mutableState = MutableStateFlow(SitulaVpnState())
    val state = mutableState.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var backend: GoBackend? = null
    @Volatile private var activeTunnel: SitulaTunnel? = null
    private var rotationJob: Job? = null

    private class SitulaTunnel(
        private val tunnelName: String,
        private val onState: (Tunnel.State) -> Unit
    ) : Tunnel {
        override fun getName(): String = tunnelName
        override fun onStateChange(newState: Tunnel.State) = onState(newState)
    }

    suspend fun connect(context: Context, region: String, sourceProfile: String): String =
        withContext(Dispatchers.IO) {
            require(region in VpnProfileStore.regions) { "Select one of the four supported regions." }
            require(sourceProfile.isNotBlank()) { "Import a WireGuard .conf profile for $region first." }
            require(
                Regex("(?im)^AllowedIPs\\s*=.*0\\.0\\.0\\.0/0").containsMatchIn(sourceProfile) &&
                    Regex("(?im)^AllowedIPs\\s*=.*::/0").containsMatchIn(sourceProfile)
            ) {
                "This profile must route both IPv4 and IPv6 through WireGuard (AllowedIPs = 0.0.0.0/0, ::/0)."
            }

            mutableState.value = SitulaVpnState(connecting = true, region = region, message = "Connecting to $region…")
            val filteredProfile = enforceAdGuardDns(sourceProfile)
            val config = Config.parse(filteredProfile.byteInputStream(Charsets.UTF_8))
            require(config.peers.isNotEmpty()) { "The WireGuard profile has no [Peer] section." }
            require(config.peers.any { it.endpoint.isPresent }) {
                "At least one WireGuard peer must include an Endpoint host and port."
            }

            val currentBackend = backend ?: GoBackend(context.applicationContext).also { backend = it }
            activeTunnel?.let { old ->
                runCatching { currentBackend.setState(old, Tunnel.State.DOWN, null) }
            }

            val tunnel = SitulaTunnel("situla-${region.lowercase()}") { newState ->
                when (newState) {
                    Tunnel.State.UP -> mutableState.value = SitulaVpnState(
                        connected = true,
                        region = region,
                        message = "WireGuard tunnel active · $region"
                    )
                    Tunnel.State.DOWN -> mutableState.value = SitulaVpnState(message = "VPN disconnected")
                    else -> mutableState.value = SitulaVpnState(
                        connecting = true,
                        region = region,
                        message = "WireGuard state: $newState"
                    )
                }
            }
            activeTunnel = tunnel
            try {
                val state = currentBackend.setState(tunnel, Tunnel.State.UP, config)
                if (state != Tunnel.State.UP) error("WireGuard did not reach the UP state.")
                mutableState.value = SitulaVpnState(
                    connected = true,
                    region = region,
                    message = "WireGuard tunnel active · $region · AdGuard DNS enabled"
                )
                "Connected to $region. Verify the peer handshake and public IP before relying on the tunnel."
            } catch (error: Exception) {
                activeTunnel = null
                mutableState.value = SitulaVpnState(message = "VPN connection failed: ${error.message ?: "unknown error"}")
                throw error
            }
        }

    fun disconnectOnBackground() {
        scope.launch { runCatching { disconnect() } }
    }

    suspend fun disconnect(): String = withContext(Dispatchers.IO) {
        stopAutoRotation()
        val currentBackend = backend
        val tunnel = activeTunnel
        try {
            if (currentBackend != null && tunnel != null) {
                currentBackend.setState(tunnel, Tunnel.State.DOWN, null)
            }
            activeTunnel = null
            mutableState.value = SitulaVpnState(message = "VPN disconnected")
            "VPN disconnected."
        } catch (error: Exception) {
            mutableState.value = SitulaVpnState(message = "Disconnect error: ${error.message ?: "unknown error"}")
            throw error
        }
    }

    fun startAutoRotation(context: Context) {
        stopAutoRotation()
        val appContext = context.applicationContext
        val profiles = VpnProfileStore.availableRegions(appContext)
        require(profiles.size == VpnProfileStore.regions.size) {
            "Import valid WireGuard profiles for all four regions before enabling automatic rotation."
        }
        rotationJob = scope.launch {
            while (isActive) {
                delay(4L * 60L * 60L * 1000L)
                val current = state.value.region ?: profiles.first()
                val index = profiles.indexOf(current).let { if (it < 0) 0 else it }
                val next = profiles[(index + 1) % profiles.size]
                val text = VpnProfileStore.load(appContext, next) ?: continue
                runCatching { connect(appContext, next, text) }
            }
        }
    }

    fun stopAutoRotation() {
        rotationJob?.cancel()
        rotationJob = null
    }

    private fun enforceAdGuardDns(profile: String): String {
        val dnsLine = "DNS = 94.140.14.14, 94.140.15.15"
        val dnsRegex = Regex("(?im)^DNS\\s*=.*$")
        return if (dnsRegex.containsMatchIn(profile)) {
            dnsRegex.replace(profile, dnsLine)
        } else {
            val interfaceHeader = Regex("(?im)^\\s*\\[Interface]\\s*$")
            require(interfaceHeader.containsMatchIn(profile)) { "Invalid WireGuard profile: [Interface] section is missing." }
            interfaceHeader.replaceFirst(profile) { "${it.value}\n$dnsLine" }
        }
    }
}