package com.workrcs.situla.data

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface SitulaApi {
    @GET("api/movies")
    suspend fun movies(@Query("page") page: Int = 1, @Query("limit") limit: Int = 20, @Query("q") query: String? = null): MoviePage

    @POST("api/admin/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/admin/dashboard")
    suspend fun adminDashboard(): AdminDashboardResponse

    @POST("api/admin/import-ids")
    suspend fun importIds(@Body request: ImportIdsRequest): ImportIdsEnvelope

    @GET("api/admin/tmdb-status")
    suspend fun tmdbStatus(): Map<String, Any>
}

class MemorySessionCookieJar : CookieJar {
    private val lock = Any()
    private val saved = mutableMapOf<String, List<Cookie>>()
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        synchronized(lock) { saved[url.host] = cookies }
    }
    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        synchronized(lock) { saved[url.host].orEmpty().filter { it.expiresAt > System.currentTimeMillis() } }
    fun clear() = synchronized(lock) { saved.clear() }
}

object SitulaApiProvider {
    val cookieJar = MemorySessionCookieJar()
    fun create(baseUrl: String): SitulaApi? {
        val normalized = baseUrl.trim().let { if (it.endsWith("/")) it else "$it/" }
        if (!normalized.startsWith("https://") && !normalized.startsWith("http://10.0.2.2:")) return null
        return runCatching {
            val client = OkHttpClient.Builder()
                .cookieJar(cookieJar)
                .connectTimeout(6, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .callTimeout(18, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build()
            Retrofit.Builder().baseUrl(normalized).client(client)
                .addConverterFactory(GsonConverterFactory.create()).build().create(SitulaApi::class.java)
        }.getOrNull()
    }
}
