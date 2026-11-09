package com.workrcs.situla.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.workrcs.situla.data.Movie

@Composable
fun MovieDetailScreen(movie: Movie, onBack: () -> Unit, onPlay: () -> Unit) {
    BackHandler(onBack = onBack)
    LazyColumn(contentPadding = PaddingValues(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Button(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    Text(" Back")
                }
                Text("MOVIE DETAILS", modifier = Modifier.padding(start = 12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
        item {
            AsyncImage(
                model = movie.backdropUrl ?: movie.posterUrl,
                contentDescription = movie.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(225.dp).background(Color(0xFF111722))
            )
        }
        item {
            Text(movie.title, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp)
            Text(
                listOfNotNull(movie.releaseYear?.toString(), if (movie.voteAverage > 0) "★ " + String.format("%.1f", movie.voteAverage) else null, movie.runtime?.takeIf { it > 0 }?.let { "$it min" })
                    .joinToString("  ·  "),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 5.dp)
            )
            Text(movie.genres.joinToString("  ·  "), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
        }
        item {
            Button(onClick = onPlay, enabled = movie.tmdbId > 0, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.PlayArrow, contentDescription = null)
                Text(" Play movie")
            }
            if (movie.playbackUrl.isNullOrBlank()) {
                Text(
                    "Playing through VidLink using this movie's TMDB ID. Availability depends on the provider.",
                    color = Color(0xFFFFB1C0), fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
        item {
            Text(movie.overview ?: "No description available.", fontSize = 14.sp, lineHeight = 21.sp)
        }
        item {
            Text("TMDB ID  ·  " + movie.tmdbId, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
            movie.imdbId?.let { Text("IMDb ID  ·  $it", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp) }
            Text("History is stored only in this app on this device.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}
