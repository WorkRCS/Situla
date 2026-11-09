package com.workrcs.situla.security

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads public EasyList/EasyPrivacy and URLHaus host rules over HTTPS.
 * Files are cached in the app's no-backup private directory and refreshed every 3 days.
 */
object AdblockFilterRepository {
    private const val MAX_LIST_BYTES = 18 * 1024 * 1024
    private const val MAX_AGE_MS = 3L * 24L * 60L * 60L * 1000L

    private data class ListSource(val name: String, val url: String, val hosts: Boolean)

    private val sources = listOf(
        ListSource("easylist.txt", "https://easylist.to/easylist/easylist.txt", false),
        ListSource("easyprivacy.txt", "https://easylist.to/easylist/easyprivacy.txt", false),
        ListSource("urlhaus-hosts.txt", "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-hosts.txt", true)
    )

    suspend fun refreshAndInitialize(context: Context): Boolean = withContext(Dispatchers.IO) {
        val directory = File(context.noBackupFilesDir, "adblock").apply { mkdirs() }
        val standard = StringBuilder()
        val hosts = StringBuilder()

        sources.forEach { source ->
            val file = File(directory, source.name)
            if (!file.exists() || System.currentTimeMillis() - file.lastModified() > MAX_AGE_MS) {
                runCatching { download(source.url, file) }
            }
            val contents = runCatching { file.takeIf { it.exists() }?.readText(Charsets.UTF_8).orEmpty() }
                .getOrDefault("")
            if (source.hosts) {
                hosts.append(contents).append('\n')
            } else {
                standard.append(contents).append('\n')
            }
        }

        if (standard.isBlank()) {
            standard.append(
                "||doubleclick.net^\n||googlesyndication.com^\n||googleadservices.com^\n" +
                    "||adservice.google.com^\n||adnxs.com^\n||taboola.com^\n||outbrain.com^\n" +
                    "||popads.net^\n||popcash.net^\n"
            )
        }
        if (hosts.isBlank()) {
            hosts.append("0.0.0.0 malware.test.invalid\n")
        }

        BraveAdblock.loadFilters(standard.toString(), hosts.toString())
    }

    private fun download(address: String, destination: File) {
        val connection = (URL(address).openConnection() as HttpURLConnection).apply {
            connectTimeout = 12_000
            readTimeout = 20_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "Situla-Android/0.1 adblock-list-updater")
        }
        try {
            check(connection.responseCode in 200..299) { "Filter list HTTP ${connection.responseCode}" }
            val bytes = connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(16 * 1024)
                var total = 0
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    total += read
                    check(total <= MAX_LIST_BYTES) { "Filter list is larger than the allowed size." }
                    output.write(buffer, 0, read)
                }
                output.toByteArray()
            }
            check(bytes.isNotEmpty()) { "Empty filter list." }
            val temporary = File(destination.parentFile, destination.name + ".tmp")
            temporary.writeBytes(bytes)
            check(temporary.renameTo(destination)) { "Could not save filter list." }
        } finally {
            connection.disconnect()
        }
    }
}