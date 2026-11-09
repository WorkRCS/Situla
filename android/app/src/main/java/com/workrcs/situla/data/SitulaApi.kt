package com.workrcs.situla.data

import android.content.Context
import android.content.pm.PackageManager
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

/** Reads the backend URL packaged in AndroidManifest metadata. */
object SitulaApiConfig {
    fun baseUrl(context: Context): String = runCatching {
        val appInfo = context.packageManager.getApplicationInfo(
            context.packageName,
            PackageManager.GET_META_DATA
        )
        appInfo.metaData?.getString("com.workrcs.situla.API_BASE_URL").orEmpty()
    }.getOrDefault("")
}

interface SitulaApi {
    @GET("api/movies")
    suspend fun movies(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
        @Query("q") query: String? = null
    ): MoviePage
}

object SitulaApiProvider {
    fun create(baseUrl: String): SitulaApi? {
        val normalized = baseUrl.trim().let { if (it.endsWith("/")) it else "$it/" }
        if (!normalized.startsWith("https://") && !normalized.startsWith("http://10.0.2.2:")) return null
        return runCatching {
            val client = OkHttpClient.Builder()
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
