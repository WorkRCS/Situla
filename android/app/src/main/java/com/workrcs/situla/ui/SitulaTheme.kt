package com.workrcs.situla.ui

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.core.view.WindowCompat
import androidx.compose.ui.graphics.Color

private val SitulaDarkColors = darkColorScheme(
    primary = Color(0xFFE11D48),
    onPrimary = Color.White,
    secondary = Color(0xFFFF758F),
    background = Color(0xFF080B12),
    surface = Color(0xFF111722),
    surfaceVariant = Color(0xFF1A2230),
    onBackground = Color(0xFFF5F6FA),
    onSurface = Color(0xFFF5F6FA),
    onSurfaceVariant = Color(0xFFAAB3C2),
    error = Color(0xFFFF8C9D)
)

private val SitulaLightColors = lightColorScheme(
    primary = Color(0xFFBE123C),
    onPrimary = Color.White,
    secondary = Color(0xFFE11D48),
    background = Color(0xFFF6F7FB),
    surface = Color.White,
    surfaceVariant = Color(0xFFE9EDF4),
    onBackground = Color(0xFF171923),
    onSurface = Color(0xFF171923),
    onSurfaceVariant = Color(0xFF5E6675),
    error = Color(0xFFB42336)
)

@Composable
fun SitulaTheme(content: @Composable () -> Unit) {
    val darkMode = isSystemInDarkTheme()
    val colors = if (darkMode) SitulaDarkColors else SitulaLightColors
    val activity = LocalContext.current as? Activity
    SideEffect {
        activity?.window?.let { window ->
            window.statusBarColor = colors.background.toArgb()
            window.navigationBarColor = colors.background.toArgb()
            WindowCompat.getInsetsController(window, window.decorView).apply {
                isAppearanceLightStatusBars = !darkMode
                isAppearanceLightNavigationBars = !darkMode
            }
        }
    }
    MaterialTheme(colorScheme = colors, content = content)
}
