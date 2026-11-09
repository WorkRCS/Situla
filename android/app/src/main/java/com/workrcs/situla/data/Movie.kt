package com.workrcs.situla.data

import com.google.gson.annotations.SerializedName

data class Movie(
    val id: String,
    @SerializedName("tmdbId") val tmdbId: Int,
    @SerializedName("imdbId") val imdbId: String? = null,
    val title: String,
    val overview: String? = null,
    @SerializedName("posterUrl") val posterUrl: String? = null,
    @SerializedName("backdropUrl") val backdropUrl: String? = null,
    @SerializedName("releaseDate") val releaseDate: String? = null,
    @SerializedName("releaseYear") val releaseYear: Int? = null,
    val runtime: Int? = null,
    @SerializedName("voteAverage") val voteAverage: Double = 0.0,
    @SerializedName("voteCount") val voteCount: Int = 0,
    val genres: List<String> = emptyList(),
    @SerializedName("moderationStatus") val moderationStatus: String? = null
)
data class MoviePage(val items: List<Movie> = emptyList(), val pagination: Pagination? = null)
data class Pagination(val page: Int, val limit: Int, val total: Int, val totalPages: Int)
data class MovieEnvelope(val item: Movie)
data class LoginRequest(val username: String, val password: String)
data class LoginResponse(val authenticated: Boolean, val username: String? = null)
data class ImportIdsRequest(val source: String = "imdb", val ids: List<String>)
data class ImportIdsResponse(
    val requested: Int, val matched: Int, val imported: Int, val updated: Int, val skipped: Int,
    val unmatched: List<String> = emptyList()
)
data class ImportIdsEnvelope(val result: ImportIdsResponse)
data class AdminDashboardResponse(val counts: AdminCounts)
data class AdminCounts(val total: Int, val pending: Int, val approved: Int, val rejected: Int)
