package com.workrcs.situla.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Refresh
import androidx.activity.compose.BackHandler
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.workrcs.situla.data.SitulaDatabase
import com.workrcs.situla.data.ImportIdsRequest
import com.workrcs.situla.data.LoginRequest
import com.workrcs.situla.data.Movie
import com.workrcs.situla.data.SitulaApi
import com.workrcs.situla.data.SitulaApiProvider
import com.workrcs.situla.data.SitulaApiConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import com.workrcs.situla.data.WatchHistoryEntity
import kotlinx.coroutines.launch

private val IMDbTestIds = listOf(
    "tt1375666", "tt0816692", "tt0482571", "tt0133093", "tt1856101",
    "tt2543164", "tt1160419", "tt1631867", "tt0945513", "tt1130884",
    "tt8946378", "tt0167404", "tt6644200", "tt1392190", "tt6710474",
    "tt3659388", "tt1454468", "tt0470752", "tt0107290", "tt0120737"
)

private enum class Tab(val label: String) { HOME("Home"), SEARCH("Search"), HISTORY("History"), SETTINGS("Settings") }

@Composable
fun SitulaApp(context: Context) {
    var tab by remember { mutableStateOf(Tab.HOME) }
    var selectedMovie by remember { mutableStateOf<Movie?>(null) }
    val api = remember { SitulaApiProvider.create(SitulaApiConfig.baseUrl(context)) }
    val database = remember { SitulaDatabase.get(context) }
    var movies by remember { mutableStateOf<List<Movie>>(emptyList()) }
    var searchResults by remember { mutableStateOf<List<Movie>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val historyDao = database.watchHistoryDao()
    val history by historyDao.observeRecent().collectAsState(initial = emptyList())
    val continueWatching by historyDao.observeContinueWatching().collectAsState(initial = emptyList())

    suspend fun loadMovies() {
        if (api == null) {
            error = "Situla backend URL is unavailable. Reinstall the latest app build or check its configuration."
            return
        }
        loading = true
        runCatching { api.movies(page = 1, limit = 20) }
            .onSuccess { movies = it.items; error = null }
            .onFailure { error = it.message ?: "Could not reach Situla backend." }
        loading = false
    }
    LaunchedEffect(Unit) {
        loadMovies()
    }

    BackHandler(enabled = selectedMovie != null || tab != Tab.HOME) {
        when {
            selectedMovie != null -> selectedMovie = null
            tab != Tab.HOME -> tab = Tab.HOME
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (selectedMovie == null) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    Tab.entries.forEach { target ->
                        val icon = when (target) {
                            Tab.HOME -> Icons.Default.Home
                            Tab.SEARCH -> Icons.Default.Search
                            Tab.HISTORY -> Icons.Default.History
                            Tab.SETTINGS -> Icons.Default.Settings
                        }
                        NavigationBarItem(
                            selected = tab == target,
                            onClick = { tab = target },
                            icon = { Icon(icon, target.label) },
                            label = { Text(target.label) }
                        )
                    }
                }
            }
        }
    ) { insets ->
        val contentModifier = Modifier.fillMaxSize().padding(insets)
            .background(MaterialTheme.colorScheme.background).padding(horizontal = 16.dp)
        Column(contentModifier) {
            when {
                selectedMovie != null -> MovieDetailScreen(
                    movie = selectedMovie!!,
                    onBack = { selectedMovie = null }
                )
                else -> {
                    Row(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        BrandMark()
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Text("SITULA", fontSize = 17.sp, fontWeight = FontWeight.Black, letterSpacing = 2.1.sp)
                            Text("MOVIES · DISCOVER MORE", fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.2.sp)
                        }
                        if (tab != Tab.SEARCH) IconButton(onClick = { tab = Tab.SEARCH }) { Icon(Icons.Default.Search, "Search movies") }
                    }
                    when (tab) {
                        Tab.HOME -> HomeScreen(
                            movies, loading, error, continueWatching,
                            onRetry = { scope.launch { loadMovies() } },
                            onOpenMovie = { selectedMovie = it }
                        )
                        Tab.SEARCH -> SearchScreen(
                            query, searchResults, loading,
                            onQueryChange = { query = it },
                            onSearch = {
                                if (api != null && query.isNotBlank()) scope.launch {
                                    loading = true
                                    runCatching { api.movies(page = 1, limit = 40, query = query.trim()) }
                                        .onSuccess { searchResults = it.items; error = null }
                                        .onFailure { error = it.message ?: "Search failed." }
                                    loading = false
                                } else error = "Configure the backend URL and enter a movie title."
                            },
                            onOpenMovie = { selectedMovie = it },
                            error = error
                        )
                        Tab.HISTORY -> HistoryScreen(history)
                        Tab.SETTINGS -> SettingsScreen(api)
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(
    movies: List<Movie>,
    loading: Boolean,
    error: String?,
    continueWatching: List<WatchHistoryEntity>,
    onRetry: () -> Unit,
    onOpenMovie: (Movie) -> Unit
) {
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item {
            if (movies.isNotEmpty()) HeroMovie(movies.first(), onOpen = { onOpenMovie(movies.first()) })
            else EmptyCatalog(loading, error, onRetry)
        }
        item {
            SectionTitle("Continue watching", if (continueWatching.isNotEmpty()) "ON THIS DEVICE" else null)
            if (continueWatching.isEmpty()) {
                Text("Your watch progress will appear here after playback is connected.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(continueWatching.take(10), key = { it.tmdbId }) { item ->
                        Column(Modifier.width(122.dp).height(148.dp)) {
                            AsyncImage(model = item.posterUrl, contentDescription = item.title, modifier = Modifier.weight(1f).fillMaxWidth())
                            Text(item.title, fontSize = 11.sp, maxLines = 1)
                            Text(formatDuration(item.positionMs) + " / " + formatDuration(item.durationMs), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        item {
            SectionTitle("Discover movies", "TMDB CATALOG")
            if (movies.isEmpty() && !loading) {
                Text("No approved titles are available yet. Check the catalog status and retry.", color = Color(0xFF8D98A9), fontSize = 12.sp)
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(movies, key = { it.tmdbId }) { movie ->
                        MoviePoster(movie, Modifier.width(116.dp), onClick = { onOpenMovie(movie) })
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyCatalog(loading: Boolean, error: String?, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().height(300.dp).background(MaterialTheme.colorScheme.surface, RoundedCornerShape(18.dp)).padding(20.dp),
        verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (loading) CircularProgressIndicator(color = MaterialTheme.colorScheme.primary) else Icon(Icons.Default.Wifi, null, modifier = Modifier.width(34.dp).height(34.dp))
        Spacer(Modifier.height(14.dp))
        Text(
            when {
                loading -> "Connecting to Situla"
                error != null -> "Backend connection failed"
                else -> "Catalog connected"
            },
            fontWeight = FontWeight.Bold
        )
        Text(
            error ?: "The backend is online, but there are no approved movies to show yet. Try again shortly or check the admin catalog.",
            color = Color(0xFF9BA5B4),
            fontSize = 11.sp
        )
        if (!loading) Button(onClick = onRetry, Modifier.padding(top = 12.dp)) { Icon(Icons.Default.Refresh, null); Text(" Retry") }
    }
}

@Composable
private fun SearchScreen(
    query: String,
    results: List<Movie>,
    busy: Boolean,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onOpenMovie: (Movie) -> Unit,
    error: String?
) {
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            query, onQueryChange, singleLine = true,
            label = { Text("Search movies") },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            modifier = Modifier.fillMaxWidth()
        )
        Button(onClick = onSearch, enabled = !busy && query.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text(if (busy) "Searching…" else "Search")
        }
        if (error != null) Text(error, color = MaterialTheme.colorScheme.error, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
        LazyColumn(contentPadding = PaddingValues(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(results, key = { it.tmdbId }) { movie ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    MoviePoster(movie, Modifier.width(76.dp), onClick = { onOpenMovie(movie) })
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(movie.title, fontWeight = FontWeight.SemiBold)
                        Text((movie.releaseYear?.toString() ?: "—") + " · ★ " + String.format("%.1f", movie.voteAverage), color = Color(0xFF9BA5B4), fontSize = 11.sp)
                        Text(movie.genres.take(3).joinToString(" · "), color = Color(0xFF9BA5B4), fontSize = 10.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryScreen(history: List<WatchHistoryEntity>) {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
        item { SectionTitle("Watch history", "SAVED ON THIS DEVICE") }
        if (history.isEmpty()) item { Text("No watch history yet. Playback progress will be stored locally on this device.", color = Color(0xFF9BA5B4), fontSize = 12.sp) }
        items(history, key = { it.tmdbId }) { item ->
            Column(Modifier.fillMaxWidth().background(Color(0xFF111722), RoundedCornerShape(14.dp)).padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AsyncImage(model = item.posterUrl, contentDescription = item.title, modifier = Modifier.width(68.dp).height(94.dp))
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(item.title, fontWeight = FontWeight.Bold)
                        Text(if (item.completed) "Completed" else "Continue watching", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                        Text("Position " + formatDuration(item.positionMs) + " / " + formatDuration(item.durationMs), color = Color(0xFF9BA5B4), fontSize = 10.sp)
                        Text("Watched " + formatDuration(item.watchedMs) + " in total", color = Color(0xFF9BA5B4), fontSize = 10.sp)
                    }
                }
                androidx.compose.material3.LinearProgressIndicator(
                    progress = { if (item.durationMs > 0) (item.positionMs.toFloat() / item.durationMs).coerceIn(0f, 1f) else 0f },
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp), color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun SettingsScreen(api: SitulaApi?) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("Admin session not connected.") }
    var importing by remember { mutableStateOf(false) }
    var idText by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<String?>(null) }
    var networkTest by remember { mutableStateOf<String?>(null) }
    var testingNetwork by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { SectionTitle("Settings & admin", "PRIVATE AREA") }
        item {
            Column(Modifier.fillMaxWidth().background(Color(0xFF111722), RoundedCornerShape(14.dp)).padding(14.dp)) {
                Text("Network diagnostics", fontWeight = FontWeight.Bold)
                Text("Phone test follows the phone's current Android network/VPN route. Backend test runs from the Vercel server and checks its TMDB API key.", color = Color(0xFF9BA5B4), fontSize = 10.sp, modifier = Modifier.padding(vertical = 6.dp))
                Button(
                    onClick = {
                        scope.launch {
                            testingNetwork = true
                            networkTest = try {
                                withContext(Dispatchers.IO) {
                                    val client = OkHttpClient.Builder()
                                        .connectTimeout(6, TimeUnit.SECONDS)
                                        .readTimeout(8, TimeUnit.SECONDS)
                                        .callTimeout(10, TimeUnit.SECONDS)
                                        .build()
                                    val request = Request.Builder()
                                        .url("https://api.themoviedb.org/3/configuration")
                                        .header("Accept", "application/json")
                                        .build()
                                    client.newCall(request).execute().use { response ->
                                        "Phone reached api.themoviedb.org (HTTP ${response.code}). This confirms network reachability only; no API key was sent."
                                    }
                                }
                            } catch (error: Exception) {
                                "Phone could not reach TMDB: " + (error.message ?: "network error")
                            } finally {
                                testingNetwork = false
                            }
                        }
                    },
                    enabled = !testingNetwork,
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (testingNetwork) "Testing phone network…" else "Test this phone → TMDB") }
                Button(
                    onClick = {
                        if (api == null) networkTest = "Backend URL is not configured."
                        else scope.launch {
                            testingNetwork = true
                            networkTest = runCatching { api.tmdbStatus() }.fold(
                                { response -> "Backend → TMDB: " + (response["message"]?.toString() ?: response["status"]?.toString() ?: "Response received") },
                                { error -> "Backend TMDB test failed: " + (error.message ?: "Check admin login and server network.") }
                            )
                            testingNetwork = false
                        }
                    },
                    enabled = !testingNetwork && api != null,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Test Vercel backend → TMDB") }
                networkTest?.let { Text(it, color = Color(0xFFB8C0CC), fontSize = 10.sp, modifier = Modifier.padding(top = 5.dp)) }
            }
        }
        item {
            Column(Modifier.fillMaxWidth().background(Color(0xFF111722), RoundedCornerShape(14.dp)).padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.AdminPanelSettings, null, tint = MaterialTheme.colorScheme.primary); Text(" Admin sign in", fontWeight = FontWeight.Bold) }
                OutlinedTextField(username, { username = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                Button(onClick = {
                    if (api == null) status = "Set situlaApiBaseUrl in android/local.properties first."
                    else scope.launch {
                        status = runCatching { api.login(LoginRequest(username, password)) }
                            .fold({ "Signed in as " + (it.username ?: username) }, { it.message ?: "Sign in failed." })
                        password = ""
                    }
                }, enabled = username.isNotBlank() && password.isNotBlank() && api != null, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Sign in securely") }
                Text(status, color = Color(0xFF9BA5B4), fontSize = 10.sp, modifier = Modifier.padding(top = 8.dp))
            }
        }
        item {
            Column(Modifier.fillMaxWidth().background(Color(0xFF111722), RoundedCornerShape(14.dp)).padding(14.dp)) {
                Text("Import real IMDb IDs", fontWeight = FontWeight.Bold)
                Text("One IMDb ID per line (maximum 200). The backend resolves IDs through TMDB and applies the movie filters.", color = Color(0xFF9BA5B4), fontSize = 10.sp, modifier = Modifier.padding(vertical = 6.dp))
                Button(onClick = { idText = IMDbTestIds.joinToString("\n") }, modifier = Modifier.fillMaxWidth()) {
                    Text("Load 20 IMDb test IDs")
                }
                OutlinedTextField(idText, { idText = it }, label = { Text("IMDb IDs (tt…; max 200)") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                Button(onClick = {
                    val ids = idText.split(Regex("[,\\s]+")).map { it.trim() }.filter { it.isNotBlank() }.distinct()
                    if (ids.isEmpty()) result = "Add at least one IMDb ID."
                    else if (ids.size > 200) result = "The maximum is 200 IDs per import job."
                    else if (api == null) result = "Backend URL is not configured."
                    else scope.launch {
                        importing = true
                        try {
                            var matched = 0
                            var added = 0
                            var updated = 0
                            var skipped = 0
                            ids.chunked(20).forEach { batch ->
                                val part = api.importIds(ImportIdsRequest(ids = batch)).result
                                matched += part.matched
                                added += part.imported
                                updated += part.updated
                                skipped += part.skipped
                            }
                            result = "Requested ${ids.size} · Matched $matched · Added $added · Updated $updated · Filtered/not found $skipped. New titles need approval."
                        } catch (error: Exception) {
                            result = error.message ?: "Import failed. Check admin session and TMDB connectivity."
                        } finally {
                            importing = false
                        }
                    }
                }, enabled = !importing && api != null && idText.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    Text(if (importing) "Importing…" else "Import real movies from TMDB")
                }
                result?.let { Text(it, color = Color(0xFF9BA5B4), fontSize = 10.sp, modifier = Modifier.padding(top = 8.dp)) }
            }
        }
    }
}

private fun formatDuration(milliseconds: Long): String {
    if (milliseconds <= 0L) return "0m"
    val totalMinutes = milliseconds / 60_000L
    val hours = totalMinutes / 60L
    val minutes = totalMinutes % 60L
    return if (hours > 0) hours.toString() + "h " + minutes + "m" else minutes.toString() + "m"
}
