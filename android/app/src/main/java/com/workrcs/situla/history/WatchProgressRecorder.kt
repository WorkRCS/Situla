package com.workrcs.situla.history

import android.os.SystemClock
import androidx.media3.common.Player
import com.workrcs.situla.data.Movie
import com.workrcs.situla.data.WatchHistoryDao
import com.workrcs.situla.data.WatchHistoryEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Saves resume position and actual play time separately, with bounded low-frequency writes. */
class WatchProgressRecorder(
    private val dao: WatchHistoryDao,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main.immediate)
) {
    private var ticker: Job? = null
    private var lastElapsedMs = 0L
    private var watchedMs = 0L

    fun start(movie: Movie, player: Player) {
        stop()
        ticker = scope.launch {
            var lastPosition = player.currentPosition.coerceAtLeast(0L)
            lastElapsedMs = SystemClock.elapsedRealtime()
            watchedMs = dao.find(movie.imdbId)?.watchedMs ?: 0L
            while (isActive) {
                delay(15_000)
                val now = SystemClock.elapsedRealtime()
                val position = player.currentPosition.coerceAtLeast(0L)
                val elapsed = (now - lastElapsedMs).coerceIn(0L, 20_000L)
                val advanced = position >= lastPosition && position - lastPosition <= elapsed + 4_000L
                if (player.isPlaying && player.playbackState == Player.STATE_READY && advanced) watchedMs += elapsed
                save(movie, position, player.duration, watchedMs)
                lastPosition = position
                lastElapsedMs = now
            }
        }
    }

    suspend fun flush(movie: Movie, player: Player) {
        val now = SystemClock.elapsedRealtime()
        val elapsed = if (lastElapsedMs > 0L) (now - lastElapsedMs).coerceIn(0L, 20_000L) else 0L
        if (player.isPlaying && player.playbackState == Player.STATE_READY) watchedMs += elapsed
        save(movie, player.currentPosition, player.duration, watchedMs)
        lastElapsedMs = now
    }

    fun stop() { ticker?.cancel(); ticker = null; lastElapsedMs = 0L }

    private suspend fun save(movie: Movie, position: Long, duration: Long, totalWatched: Long) {
        val safeDuration = duration.takeIf { it > 0L } ?: 0L
        dao.upsert(WatchHistoryEntity(
            imdbId = movie.imdbId, title = movie.title, posterUrl = movie.posterUrl,
            releaseYear = movie.releaseYear, positionMs = position.coerceAtLeast(0L),
            durationMs = safeDuration, watchedMs = totalWatched.coerceAtLeast(0L),
            completed = safeDuration > 0L && position >= safeDuration * 0.95,
            lastWatchedAtMs = System.currentTimeMillis()
        ))
    }
}
