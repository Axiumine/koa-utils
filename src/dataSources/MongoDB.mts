import * as dotenv from 'dotenv'
import * as mongoose from 'mongoose'

dotenv.config()

// DeprecationWarning: collection.ensureIndex is deprecated.Use createIndexes instead.
// mongoose.set('useCreateIndex', true);

export async function MongoDBConnect() {
	console.info('[MongoDB] Try connect to database... ')

	const options: mongoose.ConnectOptions = {
		// prime direttive
		// useCreateIndex: true,
		// useNewUrlParser: true,
		family: 4, // ipv4
		// useFindAndModify: false,
		// useUnifiedTopology: true,
		serverSelectionTimeoutMS: 5000,
		// retryWrites: true,

		// nuove direttive
		autoIndex: true
		// reconnectTries: Number.MAX_VALUE, // conflitto con useUnifiedTopology
		// reconnectInterval: 500, // conflitto con useUnifiedTopology
		// bufferMaxEntries: 0,
		// keepAlive: true,
		// keepAliveInitialDelay: 300000
	}
	mongoose.set('sanitizeFilter', true)
	mongoose.set('strictQuery', false) // will be done in mongose 7
	await mongoose.connect(`${process.env.MONGODB_URI}`, options)
	console.info(
		'[MongoDB] OK: MongoDB connection has been established successfully. '
	)
}

export async function MongoDBDisconnect() {
	console.info('[MongoDB] Try close connection to database... ')
	await mongoose.disconnect()
	console.info('[MongoDB] OK: MongoDB connection has been closed successfully.')
}
