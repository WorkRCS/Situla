package com.workrcs.situla.ui

import android.content.Context
import android.net.VpnService
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult
import com.workrcs.situla.security.AdblockFilterRepository
import com.workrcs.situla.security.BraveAdblock
import com.workrcs.situla.vpn.VpnProfileStore
import com.workrcs.situla.vpn.WireGuardVpnManager
import com.wireguard.config.Config
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun SitulaVpnControls(context: Context) {
    val vpn by WireGuardVpnManager.state.collectAsState()
    val scope = rememberCoroutineScope()
    var selectedRegion by remember { mutableStateOf(VpnProfileStore.regions.first()) }
    var autoConnectRegion by remember(selectedRegion) {
        mutableStateOf(VpnProfileStore.autoConnectRegion(context) == selectedRegion)
    }
    var available by remember { mutableStateOf(VpnProfileStore.availableRegions(context)) }
    var autoRotate by remember { mutableStateOf(VpnProfileStore.autoRotateEnabled(context)) }
    var message by remember { mutableStateOf<String?>(null) }
    var pendingConnect by remember { mutableStateOf<Pair<String, String>?>(null) }

    fun connect(profile: Pair<String, String>) {
        scope.launch {
            message = "Connecting to ${profile.first}…"
            runCatching { WireGuardVpnManager.connect(context, profile.first, profile.second) }
                .onSuccess {
                    message = it
                    if (autoRotate && available.size == VpnProfileStore.regions.size) {
                        runCatching { WireGuardVpnManager.startAutoRotation(context) }
                            .onFailure { message = it.message ?: "Could not start automatic rotation." }
                    }
                }
                .onFailure { message = it.message ?: "VPN connection failed." }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(StartActivityForResult()) { result: ActivityResult ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            pendingConnect?.let(::connect)
        } else {
            message = "Android VPN permission was not granted."
        }
    }

    val profilePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        val raw = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                            ?: error("Could not read the selected file.")
                        val preparedProfile = VpnProfileStore.prepareFullTunnelProfile(raw)
                        VpnProfileStore.save(context, selectedRegion, preparedProfile)
                        "Saved a valid WireGuard profile for $selectedRegion."
                    }
                }
                message = result.getOrElse { it.message ?: "Could not import the profile." }
                available = VpnProfileStore.availableRegions(context)
            }
        }
    }

    Column(
        Modifier.fillMaxWidth().background(Color(0xFF111722), RoundedCornerShape(14.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        Text("Situla VPN · WireGuard", fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
        Text(
            "Import one provider-issued .conf file for each region. Profiles and private keys are stored in this app's private, non-backed-up storage.",
            color = Color(0xFF9BA5B4), fontSize = 10.sp
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            VpnProfileStore.regions.forEach { region ->
                FilterChip(
                    selected = selectedRegion == region,
                    onClick = { selectedRegion = region },
                    label = { Text(region, fontSize = 9.sp) }
                )
            }
        }
        val selectedHasProfile = selectedRegion in available
        Text(
            if (selectedHasProfile) "$selectedRegion profile imported" else "No $selectedRegion profile imported",
            color = if (selectedHasProfile) Color(0xFF9DD6A6) else Color(0xFFFFB1C0),
            fontSize = 10.sp
        )
        Button(
            onClick = { profilePicker.launch(arrayOf("*/*")) },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Import $selectedRegion WireGuard .conf") }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(
                onClick = {
                    val raw = VpnProfileStore.load(context, selectedRegion)
                    if (raw == null) {
                        message = "Import a WireGuard profile for $selectedRegion first."
                    } else {
                        pendingConnect = selectedRegion to raw
                        val permission = VpnService.prepare(context)
                        if (permission == null) connect(selectedRegion to raw)
                        else permissionLauncher.launch(permission)
                    }
                },
                enabled = !vpn.connecting && selectedHasProfile,
                modifier = Modifier.weight(1f)
            ) { Text(if (vpn.connecting) "Connecting…" else "Connect") }
            Button(
                onClick = { scope.launch { message = runCatching { WireGuardVpnManager.disconnect() }.getOrElse { it.message ?: "Disconnect failed." } } },
                enabled = vpn.connected || vpn.connecting,
                modifier = Modifier.weight(1f)
            ) { Text("Disconnect") }
        }

        Text(
            vpn.message,
            color = if (vpn.connected) Color(0xFF9DD6A6) else MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 10.sp
        )

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("Auto-connect on app launch", fontSize = 12.sp)
                Text("Connect automatically to $selectedRegion after Android permission is granted.", color = Color(0xFF9BA5B4), fontSize = 9.sp)
            }
            Switch(
                checked = autoConnectRegion,
                enabled = selectedHasProfile,
                onCheckedChange = { enabled ->
                    autoConnectRegion = enabled
                    VpnProfileStore.setAutoConnectRegion(context, if (enabled) selectedRegion else null)
                }
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("Automatic region rotation", fontSize = 12.sp)
                Text("Rotate every 4 hours while Situla remains active. Requires all four profiles.", color = Color(0xFF9BA5B4), fontSize = 9.sp)
            }
            Switch(
                checked = autoRotate,
                enabled = vpn.connected && available.size == VpnProfileStore.regions.size,
                onCheckedChange = { enabled ->
                    autoRotate = enabled
                    VpnProfileStore.setAutoRotateEnabled(context, enabled)
                    if (enabled) {
                        runCatching { WireGuardVpnManager.startAutoRotation(context) }
                            .onFailure { autoRotate = false; message = it.message }
                    } else {
                        WireGuardVpnManager.stopAutoRotation()
                    }
                }
            )
        }
        Text("Profiles imported: ${available.size}/4", color = Color(0xFF9BA5B4), fontSize = 9.sp)
        message?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
        Text(
            "The VPN uses the provider's WireGuard endpoint and key. The app cannot create a working exit server or region IP without those profiles.",
            color = Color(0xFFFFD28A), fontSize = 9.sp
        )
    }
}

@Composable
fun SitulaProtectionControls(context: Context) {
    val scope = rememberCoroutineScope()
    var ready by remember { mutableStateOf(BraveAdblock.ready) }
    var refreshing by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier.fillMaxWidth().background(Color(0xFF111722), RoundedCornerShape(14.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Text("Brave Adblock · adblock-rust", fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
        Text(
            if (ready) "Rust network filter engine is loaded for the embedded VidLink player."
            else "Brave Rust engine is not active yet. Refresh filter lists to initialize it.",
            color = if (ready) Color(0xFF9DD6A6) else Color(0xFFFFB1C0),
            fontSize = 10.sp
        )
        Button(
            onClick = {
                scope.launch {
                    refreshing = true
                    ready = withContext(Dispatchers.IO) { AdblockFilterRepository.refreshAndInitialize(context, forceRefresh = true) }
                    message = if (ready) "Brave engine initialized with downloaded or cached filter rules." else "Filter engine failed: ${BraveAdblock.lastError ?: "native library unavailable"}"
                    refreshing = false
                }
            },
            enabled = !refreshing,
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (refreshing) "Updating filters…" else "Update ad & malware filters") }

        message?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 9.sp) }
        Text(
            "Brave network rules filter requests inside Situla's WebView player. WireGuard routes device traffic and uses AdGuard DNS for ad, tracker and phishing-domain filtering. DNS filtering cannot remove every same-domain video ad or webpage overlay.",
            color = Color(0xFF9BA5B4), fontSize = 9.sp
        )
    }
}
