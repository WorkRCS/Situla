package com.workrcs.situla.ui

import android.app.Activity
import android.content.pm.ActivityInfo
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.workrcs.situla.data.Movie
import com.workrcs.situla.data.SitulaDatabase
import com.workrcs.situla.history.WatchProgressRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@Composable
fun MoviePlayerScreen(movie: Movie, onBack: () -> Unit) {
    val streamUrl = movie.playbackUrl?.trim().orEmpty()
    val activity = LocalContext.current as? Activity
    var fullscreen by remember(movie.tmdbId) { mutableStateOf(false) }
    fun setFullscreen(enabled: Boolean) {
        fullscreen = enabled
        activity?.requestedOrientation = if (enabled) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        activity?.window?.let { window ->
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            if (enabled) {
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }
    val secureUrl = streamUrl.startsWith("https://", ignoreCase = true)
    BackHandler(onBack = { if (fullscreen) setFullscreen(false) else onBack() })

    if (!secureUrl) {
        Column(Modifier.fillMaxSize().padding(20.dp)) {
            Button(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "Back"); Text(" Back") }
            Text("No approved HTTPS playback source is available for this movie.", modifier = Modifier.padding(top = 14.dp))
        }
        return
    }

    val appContext = LocalContext.current.applicationContext
    val lifecycleOwner = LocalLifecycleOwner.current
    val player = remember(movie.tmdbId, streamUrl) { ExoPlayer.Builder(appContext).build() }
    val historyDao = remember(movie.tmdbId) { SitulaDatabase.get(appContext).watchHistoryDao() }
    val recorder = remember(movie.tmdbId) { WatchProgressRecorder(historyDao) }
    val playerScope = remember(movie.tmdbId, streamUrl) { CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate) }

    DisposableEffect(player, movie.tmdbId, lifecycleOwner) {
        player.setMediaItem(MediaItem.fromUri(streamUrl))
        player.prepare()
        playerScope.launch {
            val previous = historyDao.find(movie.tmdbId)
            if (previous != null && !previous.completed && previous.positionMs > 0L) {
                player.seekTo(previous.positionMs)
            }
            recorder.start(movie, player)
            player.playWhenReady = true
        }

        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
                playerScope.launch {
                    recorder.flush(movie, player)
                    player.pause()
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            setFullscreen(false)
            playerScope.launch {
                runCatching { recorder.flush(movie, player) }
                player.pause()
                recorder.stop()
                player.release()
                playerScope.cancel()
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        if (!fullscreen) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Button(onClick = onBack, modifier = Modifier.weight(1f).padding(8.dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    Text("  " + movie.title)
                }
                IconButton(onClick = { setFullscreen(true) }) {
                    Icon(Icons.Default.Fullscreen, contentDescription = "Enter landscape fullscreen")
                }
            }
        }
        Box(Modifier.fillMaxWidth().weight(1f)) {
            AndroidView(
                factory = { viewContext -> PlayerView(viewContext).apply { this.player = player; useController = true; keepScreenOn = true } },
                update = { it.player = player },
                modifier = Modifier.fillMaxSize()
            )
            if (fullscreen) {
                IconButton(onClick = { setFullscreen(false) }, modifier = Modifier.align(Alignment.TopEnd)) {
                    Icon(Icons.Default.FullscreenExit, contentDescription = "Exit fullscreen", tint = Color.White)
                }
            }
        }
    }
}
