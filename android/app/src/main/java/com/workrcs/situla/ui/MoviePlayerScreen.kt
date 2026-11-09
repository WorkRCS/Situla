package com.workrcs.situla.ui

import androidx.compose.runtime.Composable
import com.workrcs.situla.data.Movie

/**
 * Backward-compatible route entry point.
 *
 * The selected movie opens directly in the in-app VidLink WebView. Movie metadata APIs
 * provide the TMDB ID; VidLinkPlayerScreen builds and opens the provider URL.
 */
@Composable
fun MoviePlayerScreen(movie: Movie, onBack: () -> Unit) {
    VidLinkPlayerScreen(movie = movie, onBack = onBack, embedded = false)
}
