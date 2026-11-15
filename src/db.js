import mongoose from 'mongoose';
import { Movie, TvSeries, AnimeSeries, User, AuthSession, GuestAccess, GuestSession, UsageState, PlaybackSession, AuthRateLimit, ActivitySession, MembershipEvent, PaymentTransaction, AdminAuditLog, Announcement, AnnouncementRead, UpcomingItem, UpcomingWaitlist, UpcomingRead } from './models.js';

let connectionPromise;
let indexesPromise;
let authSessionExpiryIndexMigrationPromise;

const INDEXED_MODELS = [
  Movie, TvSeries, AnimeSeries, User, AuthSession, GuestAccess,
  GuestSession, UsageState, PlaybackSession, AuthRateLimit, ActivitySession,
  MembershipEvent, PaymentTransaction, AdminAuditLog, Announcement, AnnouncementRead,
  UpcomingItem, UpcomingWaitlist, UpcomingRead
];

async function removeLegacyAuthSessionExpiryIndex() {
  if (!authSessionExpiryIndexMigrationPromise) {
    authSessionExpiryIndexMigrationPromise = AuthSession.collection.dropIndex('expiresAt_1').catch((error) => {
      if ([26, 27].includes(error?.code) || ['NamespaceNotFound', 'IndexNotFound'].includes(error?.codeName)) {
        return null;
      }
      authSessionExpiryIndexMigrationPromise = undefined;
      throw error;
    });
  }
  await authSessionExpiryIndexMigrationPromise;
}

function databaseError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.status = 503;
  error.code = code;
  return error;
}

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) {
    throw databaseError(
      'MONGODB_URI and MONGODB_DB_NAME must be configured in .env.',
      'DATABASE_NOT_CONFIGURED'
    );
  }

  if (mongoose.connection.readyState !== 1) {
    if (mongoose.connection.readyState === 0) connectionPromise = undefined;
    if (!connectionPromise) {
      const configuredPoolSize = Number(process.env.MONGODB_MAX_POOL_SIZE || 8);
      const maxPoolSize = Number.isSafeInteger(configuredPoolSize) && configuredPoolSize >= 2
        ? Math.min(configuredPoolSize, 100)
        : 8;
      connectionPromise = mongoose.connect(uri, {
        dbName,
        // One bounded pool per process; tune through MONGODB_MAX_POOL_SIZE for VPS deployments.
        maxPoolSize,
        minPoolSize: 0,
        maxConnecting: 2,
        maxIdleTimeMS: 120_000,
        waitQueueTimeoutMS: 2_000,
        connectTimeoutMS: 5_000,
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 15_000,
        autoIndex: false
      }).then(() => mongoose.connection).catch((error) => {
        connectionPromise = undefined;
        throw databaseError('MongoDB is unavailable. Check the connection string and network access.', 'DATABASE_UNAVAILABLE', error);
      });
    }
    await connectionPromise;
  }

  // Existing installations have a TTL index that deletes otherwise valid logins.
  // Drop it before serving authenticated requests; this is idempotent per process.
  try {
    await removeLegacyAuthSessionExpiryIndex();
  } catch (error) {
    throw databaseError('Persistent login sessions could not be initialized.', 'AUTH_SESSION_MIGRATION_FAILED', error);
  }

  // Index creation is a deployment/migration task, never part of a serverless cold request.
  return mongoose.connection;
}

export async function initializeDatabaseIndexes() {
  await connectDatabase();
  if (!indexesPromise) {
    indexesPromise = Promise.all(INDEXED_MODELS.map((Model) => Model.createIndexes())).catch((error) => {
      indexesPromise = undefined;
      throw databaseError('MongoDB indexes could not be initialized.', 'DATABASE_INDEX_ERROR', error);
    });
  }
  return indexesPromise;
}
