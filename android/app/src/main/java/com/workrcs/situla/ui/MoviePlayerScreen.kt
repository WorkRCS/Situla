package com.workrcs.situla.ui

import androidx.compose.runtime.Composable
import com.workrcs.situla.data.Movie

/** Opens the IMDb-addressed movie using its private VidLink provider mapping. */
@Composable
fun MoviePlayerScreen(movie: Movie, onBack: () -> Unit) {
    VidLinkPlayerScreen(movie = movie, onBack = onBack, embedded = false)
}
