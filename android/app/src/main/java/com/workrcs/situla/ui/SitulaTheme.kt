package com.workrcs.situla.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val SitulaColors = darkColorScheme(
    primary = Color(0xFFE11D48), secondary = Color(0xFFFF758F),
    background = Color(0xFF080B12), surface = Color(0xFF111722),
    surfaceVariant = Color(0xFF1A2230), onBackground = Color(0xFFF5F6FA),
    onSurface = Color(0xFFF5F6FA), onSurfaceVariant = Color(0xFFAAB3C2)
)

@Composable
fun SitulaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = SitulaColors, content = content)
}
