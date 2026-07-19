import * as dotenv from 'dotenv'
import * as mongoose from 'mongoose'

dotenv.config()

// DeprecationWarning: collection.ensureIndex is deprecated.Use createIndexes instead.
// mongoose.set('useCreateIndex', true);

export async function MongoDBConnect() {
	console.info('[MongoDB] Try connect to database... ')

	const options: mongoose.ConnectOptions = {
		// initial directives
		// useCreateIndex: true,
		// useNewUrlParser: true,
		family: 4, // ipv4
		// useFindAndModify: false,
		// useUnifiedTopology: true,
		serverSelectionTimeoutMS: 5000,
		// retryWrites: true,

		// new directives
		autoIndex: true
		// reconnectTries: Number.MAX_VALUE, // conflict with useUnifiedTopology
		// reconnectInterval: 500, // conflict with useUnifiedTopology
		// bufferMaxEntries: 0,
		// keepAlive: true,
		// keepAliveInitialDelay: 300000
	}
	mongoose.set('sanitizeFilter', true)
	mongoose.set('strictQuery', false) // will be done in mongose 7
	await mongoose.connect(`${process.env.MONGODB_URI}`, options)
	/* c8 ignore next 2 -- success log + closing brace; covered only with live MongoDB */
	console.info('[MongoDB] OK: MongoDB connection has been established successfully. ')
}

export async function MongoDBDisconnect() {
	console.info('[MongoDB] Try close connection to database... ')
	await mongoose.disconnect()
	console.info('[MongoDB] OK: MongoDB connection has been closed successfully.')
}
