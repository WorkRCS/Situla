package com.workrcs.situla.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "watch_history", indices = [
    Index(value = ["lastWatchedAtMs"]),
    Index(value = ["completed", "lastWatchedAtMs"])
])
data class WatchHistoryEntity(
    @PrimaryKey val tmdbId: Int,
    val title: String,
    val posterUrl: String?,
    val releaseYear: Int?,
    val positionMs: Long,
    val durationMs: Long,
    val watchedMs: Long,
    val completed: Boolean,
    val lastWatchedAtMs: Long
)

@Dao
interface WatchHistoryDao {
    @Query("SELECT * FROM watch_history ORDER BY lastWatchedAtMs DESC")
    fun observeRecent(): Flow<List<WatchHistoryEntity>>

    @Query("SELECT * FROM watch_history WHERE completed = 0 AND positionMs > 0 ORDER BY lastWatchedAtMs DESC")
    fun observeContinueWatching(): Flow<List<WatchHistoryEntity>>

    @Query("SELECT * FROM watch_history WHERE tmdbId = :tmdbId LIMIT 1")
    suspend fun find(tmdbId: Int): WatchHistoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: WatchHistoryEntity)

    @Query("DELETE FROM watch_history WHERE tmdbId = :tmdbId")
    suspend fun delete(tmdbId: Int)

    @Query("DELETE FROM watch_history")
    suspend fun clear()
}

@Database(entities = [WatchHistoryEntity::class], version = 1, exportSchema = false)
abstract class SitulaDatabase : RoomDatabase() {
    abstract fun watchHistoryDao(): WatchHistoryDao
    companion object {
        @Volatile private var instance: SitulaDatabase? = null
        fun get(context: Context): SitulaDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, SitulaDatabase::class.java, "situla_local.db")
                .build().also { instance = it }
        }
    }
}
