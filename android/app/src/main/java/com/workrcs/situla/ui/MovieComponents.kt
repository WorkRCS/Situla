package com.workrcs.situla.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.workrcs.situla.data.Movie

@Composable
fun MoviePoster(movie: Movie, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Column(modifier.clip(RoundedCornerShape(10.dp)).then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)) {
        AsyncImage(model = movie.posterUrl, contentDescription = movie.title, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)).background(Color(0xFF1B2432)))
        Text(movie.title, Modifier.padding(top = 7.dp), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFFC45C), modifier = Modifier.size(12.dp))
            Text(" " + String.format("%.1f", movie.voteAverage) + "  ·  " + (movie.releaseYear?.toString() ?: "—"), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun SectionTitle(title: String, trailing: String? = null) {
    Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp)
        if (trailing != null) Text(trailing, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
    }
}

@Composable
fun BrandMark(modifier: Modifier = Modifier) {
    Box(modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(Brush.linearGradient(listOf(Color(0xFFF43F5E), Color(0xFFBE123C)))), contentAlignment = Alignment.Center) {
        Icon(Icons.Default.PlayArrow, contentDescription = "Situla", tint = Color.White, modifier = Modifier.size(25.dp))
    }
}

@Composable
fun HeroMovie(movie: Movie, onOpen: () -> Unit) {
    Box(Modifier.fillMaxWidth().height(360.dp).clip(RoundedCornerShape(18.dp)).clickable { onOpen() }) {
        AsyncImage(model = movie.backdropUrl ?: movie.posterUrl, contentDescription = movie.title, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xF0080B12)))))
        Column(Modifier.align(Alignment.BottomStart).padding(18.dp)) {
            Text("SITULA ORIGINAL DISCOVERY", color = Color(0xFFFFA6B6), fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.8.sp)
            Text(movie.title, fontSize = 27.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text((movie.releaseYear?.toString() ?: "Movie") + "  ·  ★ " + String.format("%.1f", movie.voteAverage), color = Color(0xFFE5E7EB), fontSize = 11.sp, modifier = Modifier.padding(top = 5.dp, bottom = 10.dp))
            Text("Explore title  →", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}
