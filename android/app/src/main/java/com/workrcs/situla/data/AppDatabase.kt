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
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "watch_history", indices = [
    Index(value = ["lastWatchedAtMs"]),
    Index(value = ["completed", "lastWatchedAtMs"])
])
data class WatchHistoryEntity(
    @PrimaryKey val imdbId: String,
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

    @Query("SELECT * FROM watch_history WHERE imdbId = :imdbId LIMIT 1")
    suspend fun find(imdbId: String): WatchHistoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: WatchHistoryEntity)

    @Query("DELETE FROM watch_history WHERE imdbId = :imdbId")
    suspend fun delete(imdbId: String)

    @Query("DELETE FROM watch_history")
    suspend fun clear()
}

@Database(entities = [WatchHistoryEntity::class], version = 2, exportSchema = false)
abstract class SitulaDatabase : RoomDatabase() {
    abstract fun watchHistoryDao(): WatchHistoryDao

    companion object {
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Version 1 stored numeric TMDB keys. They cannot safely be
                // translated to IMDb IDs offline, so clear only this local cache.
                db.execSQL("DROP TABLE IF EXISTS watch_history")
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS watch_history (
                        imdbId TEXT NOT NULL PRIMARY KEY,
                        title TEXT NOT NULL,
                        posterUrl TEXT,
                        releaseYear INTEGER,
                        positionMs INTEGER NOT NULL,
                        durationMs INTEGER NOT NULL,
                        watchedMs INTEGER NOT NULL,
                        completed INTEGER NOT NULL,
                        lastWatchedAtMs INTEGER NOT NULL
                    )"""
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_watch_history_lastWatchedAtMs ON watch_history(lastWatchedAtMs)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_watch_history_completed_lastWatchedAtMs ON watch_history(completed, lastWatchedAtMs)")
            }
        }

        @Volatile private var instance: SitulaDatabase? = null
        fun get(context: Context): SitulaDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, SitulaDatabase::class.java, "situla_local.db")
                .addMigrations(MIGRATION_1_2)
                .build().also { instance = it }
        }
    }
}
