package com.workrcs.situla.vpn

import android.content.Context
import android.os.SystemClock
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
import java.net.URL
import javax.net.ssl.HttpsURLConnection

data class SitulaVpnState(
    val connected: Boolean = false,
    val connecting: Boolean = false,
    val region: String? = null,
    val message: String = "VPN disconnected",
    val latencyMs: Long? = null,
    val latencyError: String? = null,
    val regionLatencies: Map<String, Long> = emptyMap()
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
    private var latencyJob: Job? = null

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
            val filteredProfile = VpnProfileStore.prepareFullTunnelProfile(sourceProfile)
            val config = Config.parse(filteredProfile.byteInputStream(Charsets.UTF_8))
            require(config.peers.isNotEmpty()) { "The WireGuard profile has no [Peer] section." }
            require(config.peers.any { it.endpoint.isPresent }) {
                "At least one WireGuard peer must include an Endpoint host and port."
            }

            mutableState.value = SitulaVpnState(
                connecting = true,
                region = region,
                message = "Connecting to $region…",
                regionLatencies = VpnProfileStore.regionLatencies(context)
            )
            val previousTunnel = activeTunnel
            val tunnel = SitulaTunnel("situla-${region.lowercase()}") { newState ->
                when (newState) {
                    Tunnel.State.UP -> mutableState.value = SitulaVpnState(
                        connected = true,
                        region = region,
                        message = "WireGuard tunnel active · $region",
                        regionLatencies = mutableState.value.regionLatencies
                    )
                    Tunnel.State.DOWN -> mutableState.value = SitulaVpnState(message = "VPN disconnected")
                    else -> mutableState.value = SitulaVpnState(
                        connecting = true,
                        region = region,
                        message = "WireGuard state: $newState"
                    )
                }
            }
            try {
                val currentBackend = backend ?: GoBackend(context.applicationContext).also { backend = it }
                val state = currentBackend.setState(tunnel, Tunnel.State.UP, config)
                if (state != Tunnel.State.UP) error("WireGuard did not reach the UP state.")
                activeTunnel = tunnel
                mutableState.value = SitulaVpnState(
                    connected = true,
                    region = region,
                    message = "WireGuard tunnel active · $region · AdGuard DNS enabled",
                    regionLatencies = VpnProfileStore.regionLatencies(context)
                )
                startLatencyMonitoring(context.applicationContext, region)
                "Connected to $region. Route latency is being measured automatically."
            } catch (error: Exception) {
                activeTunnel = previousTunnel
                val oldRegion = previousTunnel?.getName()?.removePrefix("situla-")?.replaceFirstChar { it.uppercase() }
                mutableState.value = if (previousTunnel == null) {
                    SitulaVpnState(message = "VPN connection failed: " + (error.message ?: "unknown error"))
                } else {
                    SitulaVpnState(
                        connected = true,
                        region = oldRegion,
                        message = "Could not connect to " + region + "; previous VPN tunnel restored: " + (error.message ?: "connection failed")
                    )
                }
                if (previousTunnel != null && oldRegion != null) {
                    startLatencyMonitoring(context.applicationContext, oldRegion)
                } else {
                    stopLatencyMonitoring()
                }
                throw error
            }
        }

    private fun startLatencyMonitoring(context: Context, region: String) {
        stopLatencyMonitoring()
        latencyJob = scope.launch {
            while (isActive) {
                val sample = runCatching { measureHttpsRouteLatency() }.getOrNull()
                val current = mutableState.value
                if (!current.connected || current.region != region) break
                if (sample != null) {
                    VpnProfileStore.saveRegionLatency(context, region, sample)
                    mutableState.value = current.copy(
                        latencyMs = sample,
                        latencyError = null,
                        regionLatencies = VpnProfileStore.regionLatencies(context)
                    )
                } else {
                    mutableState.value = current.copy(
                        latencyMs = null,
                        latencyError = "Latency test unavailable"
                    )
                }
                delay(30_000L)
            }
        }
    }

    private fun stopLatencyMonitoring() {
        latencyJob?.cancel()
        latencyJob = null
    }

    private fun measureHttpsRouteLatency(): Long {
        val probeUrl = "https://www.cloudflare.com/cdn-cgi/trace?situla_probe=${System.nanoTime()}"
        val connection = URL(probeUrl).openConnection() as HttpsURLConnection
        connection.connectTimeout = 5_000
        connection.readTimeout = 5_000
        connection.requestMethod = "GET"
        connection.useCaches = false
        connection.setRequestProperty("Cache-Control", "no-cache, no-store")
        connection.setRequestProperty("Pragma", "no-cache")
        val startedAt = SystemClock.elapsedRealtime()
        try {
            val responseCode = connection.responseCode
            check(responseCode in 200..299) { "Latency endpoint returned HTTP $responseCode" }
            connection.inputStream.use { input -> input.readBytes() }
            return (SystemClock.elapsedRealtime() - startedAt).coerceAtLeast(1L)
        } finally {
            connection.disconnect()
        }
    }

    fun disconnectOnBackground() {
        scope.launch { runCatching { disconnect() } }
    }

    suspend fun disconnect(): String = withContext(Dispatchers.IO) {
        stopAutoRotation()
        stopLatencyMonitoring()
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
        require(profiles.size >= 2) {
            "At least two working region profiles are needed for automatic rotation."
        }
        rotationJob = scope.launch {
            while (isActive) {
                delay(5L * 60L * 60L * 1000L)
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

}