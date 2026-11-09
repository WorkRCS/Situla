package com.workrcs.situla.ui

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
fun MoviePlayerScreen(context: Context, movie: Movie, onBack: () -> Unit) {
    val streamUrl = movie.playbackUrl?.trim().orEmpty()
    val secureUrl = streamUrl.startsWith("https://", ignoreCase = true)
    BackHandler(onBack = onBack)

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
    val recorder = remember(movie.tmdbId) { WatchProgressRecorder(SitulaDatabase.get(appContext).watchHistoryDao()) }
    val playerScope = remember(movie.tmdbId, streamUrl) { CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate) }

    DisposableEffect(player, movie.tmdbId, lifecycleOwner) {
        player.setMediaItem(MediaItem.fromUri(streamUrl))
        player.prepare()
        recorder.start(movie, player)
        player.playWhenReady = true

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
            player.pause()
            playerScope.launch {
                runCatching { recorder.flush(movie, player) }
                recorder.stop()
                player.release()
                playerScope.cancel()
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth().padding(8.dp)) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
            Text("  " + movie.title)
        }
        AndroidView(
            factory = { viewContext -> PlayerView(viewContext).apply { this.player = player; useController = true; keepScreenOn = true } },
            update = { it.player = player },
            modifier = Modifier.fillMaxWidth().weight(1f)
        )
    }
}
