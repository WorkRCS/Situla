package com.workrcs.situla.ui

import android.app.Activity
import android.content.Context
import android.net.VpnService
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.workrcs.situla.vpn.VpnProfileStore
import com.workrcs.situla.vpn.WireGuardVpnManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun SitulaVpnControls(context: Context, onClose: () -> Unit) {
    val vpn by WireGuardVpnManager.state.collectAsState()
    val scope = rememberCoroutineScope()
    val savedLatencies = remember(vpn.regionLatencies) {
        vpn.regionLatencies.ifEmpty { VpnProfileStore.regionLatencies(context) }
    }
    var selectedRegion by remember {
        mutableStateOf(VpnProfileStore.autoConnectRegion(context) ?: VpnProfileStore.regions.first())
    }
    var available by remember { mutableStateOf(VpnProfileStore.availableRegions(context)) }
    var autoConnect by remember { mutableStateOf(VpnProfileStore.autoConnectEnabled(context)) }
    var autoRotate by remember { mutableStateOf(VpnProfileStore.autoRotateEnabled(context)) }
    var message by remember { mutableStateOf<String?>(null) }
    var pendingConnect by remember { mutableStateOf<Pair<String, String>?>(null) }

    fun connect(profile: Pair<String, String>) {
        scope.launch {
            message = "Connecting to ${profile.first}…"
            runCatching { WireGuardVpnManager.connect(context.applicationContext, profile.first, profile.second) }
                .onSuccess {
                    message = it
                    if (autoRotate && VpnProfileStore.availableRegions(context).size >= 2) {
                        runCatching { WireGuardVpnManager.startAutoRotation(context.applicationContext) }
                            .onFailure { error -> message = error.message ?: "Automatic region rotation could not start." }
                    }
                }
                .onFailure { error -> message = error.message ?: "VPN connection failed." }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            pendingConnect?.let(::connect)
        } else {
            message = "Android VPN permission was not granted."
        }
        pendingConnect = null
    }

    var importRegion by remember { mutableStateOf(selectedRegion) }
    val profilePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        val raw = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                            ?: error("Could not read the selected WireGuard profile.")
                        val normalized = VpnProfileStore.prepareFullTunnelProfile(raw)
                        VpnProfileStore.save(context.applicationContext, importRegion, normalized)
                        "WireGuard profile saved for $importRegion."
                    }
                }
                message = result.getOrElse { it.message ?: "Could not import the profile." }
                available = VpnProfileStore.availableRegions(context)
            }
        }
    }

    Column(
        Modifier.fillMaxWidth().background(Color(0xFF111722), RoundedCornerShape(16.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Situla VPN · WireGuard", fontWeight = FontWeight.Bold)
                Text("Encrypted route · region selection · measured latency", color = Color(0xFF9BA5B4), fontSize = 10.sp)
            }
            TextButton(onClick = onClose) { Text("Close") }
        }

        Text(
            "Select the fastest region from the profiles already imported on this device. Situla cannot create public VPN gateways; each region needs a real WireGuard profile from your VPN provider.",
            color = Color(0xFFFFD28A), fontSize = 10.sp
        )

        VpnProfileStore.regions.chunked(2).forEach { regionRow ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                regionRow.forEach { region ->
                    val latency = savedLatencies[region]?.let { "$it ms" } ?: "—"
                    FilterChip(
                        selected = selectedRegion == region,
                        onClick = { selectedRegion = region },
                        label = {
                            Text(
                                (if (vpn.connected && vpn.region == region) "● " else "") + "$region · $latency",
                                fontSize = 9.sp
                            )
                        }
                    )
                }
            }
        }

        val selectedHasProfile = selectedRegion in available
        Text(
            if (selectedHasProfile) "$selectedRegion profile is ready"
            else "No $selectedRegion profile imported · $available.size of 6 regions ready",
            color = if (selectedHasProfile) Color(0xFF9DD6A6) else Color(0xFFFFB1C0),
            fontSize = 10.sp
        )

        Button(
            onClick = {
                importRegion = selectedRegion
                profilePicker.launch(arrayOf("*/*"))
            },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Import WireGuard profile for $selectedRegion") }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(
                onClick = {
                    val raw = VpnProfileStore.load(context.applicationContext, selectedRegion)
                    if (raw == null) {
                        message = "Import a real WireGuard profile for $selectedRegion first."
                    } else {
                        pendingConnect = selectedRegion to raw
                        val permission = VpnService.prepare(context)
                        if (permission == null) {
                            connect(selectedRegion to raw)
                            pendingConnect = null
                        } else {
                            permissionLauncher.launch(permission)
                        }
                    }
                },
                enabled = !vpn.connecting && selectedHasProfile,
                modifier = Modifier.weight(1f)
            ) { Text(if (vpn.connecting) "Connecting…" else "Connect") }

            Button(
                onClick = {
                    scope.launch {
                        message = runCatching { WireGuardVpnManager.disconnect() }
                            .getOrElse { it.message ?: "Disconnect failed." }
                    }
                },
                enabled = vpn.connected || vpn.connecting,
                modifier = Modifier.weight(1f)
            ) { Text("Disconnect") }
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("Auto-connect on app launch", fontSize = 12.sp)
                Text("Use the lowest-latency previously tested region that has a profile.", color = Color(0xFF9BA5B4), fontSize = 9.sp)
            }
            Switch(
                checked = autoConnect,
                onCheckedChange = { enabled ->
                    autoConnect = enabled
                    VpnProfileStore.setAutoConnectRegion(context, if (enabled) selectedRegion else null)
                }
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("Automatic region rotation", fontSize = 12.sp)
                Text("Rotate every 5 hours when at least two region profiles are available.", color = Color(0xFF9BA5B4), fontSize = 9.sp)
            }
            Switch(
                checked = autoRotate,
                enabled = vpn.connected && available.size >= 2,
                onCheckedChange = { enabled ->
                    autoRotate = enabled
                    VpnProfileStore.setAutoRotateEnabled(context, enabled)
                    if (enabled) {
                        runCatching { WireGuardVpnManager.startAutoRotation(context.applicationContext) }
                            .onFailure { error -> autoRotate = false; message = error.message ?: "Rotation could not start." }
                    } else {
                        WireGuardVpnManager.stopAutoRotation()
                    }
                }
            )
        }

        Text(
            when {
                vpn.connected -> "Connected: ${vpn.region} · latency " + (vpn.latencyMs?.let { "$it ms" } ?: (vpn.latencyError ?: "measuring…"))
                vpn.connecting -> vpn.message
                else -> vpn.message
            },
            color = if (vpn.connected) Color(0xFF9DD6A6) else MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp
        )
        Text(
            "VPN routing and DNS filtering apply to the Android device while connected. A website opened in a normal desktop/mobile browser cannot start this device VPN.",
            color = Color(0xFF9BA5B4), fontSize = 9.sp
        )
        message?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
    }
}
