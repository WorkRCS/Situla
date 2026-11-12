import mongoose from 'mongoose';
import { Movie, TvSeries, AnimeSeries, User, AuthSession, Device, GuestAccess, GuestSession, UsageState, PlaybackSession, AuthRateLimit, ActivitySession, MembershipEvent, PaymentTransaction, AdminAuditLog } from './models.js';

let connectionPromise;
let indexesPromise;

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) throw new Error('MONGODB_URI and MONGODB_DB_NAME must be configured.');

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
        throw error;
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
      throw error;
    });
  }
  await indexesPromise;
  return mongoose.connection;
}
