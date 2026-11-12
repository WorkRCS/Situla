import mongoose from 'mongoose';
import { Movie, TvSeries, AnimeSeries, User, AuthSession, Device, GuestAccess, GuestSession, UsageState, PlaybackSession, AuthRateLimit, ActivitySession, MembershipEvent, PaymentTransaction, AdminAuditLog } from './models.js';

let connectionPromise;
let indexesPromise;

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
    if (!connectionPromise) {
      connectionPromise = mongoose.connect(uri, {
        dbName,
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 20000,
        autoIndex: false
      }).then(() => mongoose.connection).catch((error) => {
        connectionPromise = undefined;
        throw databaseError('MongoDB is unavailable. Check the connection string and network access.', 'DATABASE_UNAVAILABLE', error);
      });
    }
    await connectionPromise;
  }

  if (!indexesPromise) {
    indexesPromise = Promise.all([
      Movie.createIndexes(),
      TvSeries.createIndexes(),
      AnimeSeries.createIndexes(),
      User.createIndexes(),
      AuthSession.createIndexes(),
      Device.createIndexes(),
      GuestAccess.createIndexes(),
      GuestSession.createIndexes(),
      UsageState.createIndexes(),
      PlaybackSession.createIndexes(),
      AuthRateLimit.createIndexes(),
      ActivitySession.createIndexes(),
      MembershipEvent.createIndexes(),
      PaymentTransaction.createIndexes(),
      AdminAuditLog.createIndexes()
    ]).catch((error) => {
      indexesPromise = undefined;
      throw databaseError('MongoDB indexes could not be initialized.', 'DATABASE_INDEX_ERROR', error);
    });
  }
  await indexesPromise;
  return mongoose.connection;
}
