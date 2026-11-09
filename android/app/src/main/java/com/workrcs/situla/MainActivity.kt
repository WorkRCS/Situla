package com.workrcs.situla

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.workrcs.situla.ui.SitulaApp
import com.workrcs.situla.ui.SitulaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent { SitulaTheme { SitulaApp(applicationContext) } }
    }
}
