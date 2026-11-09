package com.workrcs.situla.ui

import androidx.compose.runtime.Composable
import com.workrcs.situla.data.Movie

/**
 * Backward-compatible route entry point.
 *
 * All playback stays in the in-app VidLink iframe. Movie metadata APIs only
 * provide the TMDB ID; the iframe src is assembled by VidLinkPlayerScreen.
 */
@Composable
fun MoviePlayerScreen(movie: Movie, onBack: () -> Unit) {
    VidLinkPlayerScreen(movie = movie, onBack = onBack, embedded = false)
}
