package com.workrcs.situla.data

import com.google.gson.annotations.SerializedName

data class Movie(
    val id: String,
    @SerializedName("imdbId") val imdbId: String,
    val title: String,
    val overview: String? = null,
    @SerializedName("posterUrl") val posterUrl: String? = null,
    @SerializedName("backdropUrl") val backdropUrl: String? = null,
    @SerializedName("releaseDate") val releaseDate: String? = null,
    @SerializedName("releaseYear") val releaseYear: Int? = null,
    val runtime: Int? = null,
    @SerializedName("voteAverage") val voteAverage: Double = 0.0,
    @SerializedName("voteCount") val voteCount: Int = 0,
    val genres: List<String> = emptyList()
)

data class MoviePage(val items: List<Movie> = emptyList(), val pagination: Pagination? = null)
data class Pagination(val page: Int, val limit: Int, val total: Int, val totalPages: Int)
data class MovieEnvelope(val item: Movie)
