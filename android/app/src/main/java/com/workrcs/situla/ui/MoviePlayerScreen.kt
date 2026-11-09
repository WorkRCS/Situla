package com.workrcs.situla.ui

import androidx.compose.runtime.Composable
import com.workrcs.situla.data.Movie

/**
 * Backward-compatible route entry point.
 *
 * The selected movie opens directly in the in-app IMDb-compatible VidSrc WebView. Movie metadata APIs provide the IMDb ID; the player builds the IMDb-based iframe URL.
 */
@Composable
fun MoviePlayerScreen(movie: Movie, onBack: () -> Unit) {
    VidLinkPlayerScreen(movie = movie, onBack = onBack, embedded = false)
}
