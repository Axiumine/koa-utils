import { LogThrow } from '@models/MongoDB/log/LogThrow.mjs'
import { Types } from 'mongoose'

// const lastSendEmail = new Date();

export const logThrow = function(log: string, errLevel: number) {
	new LogThrow({
		_id: new Types.ObjectId(),
		message: log,
		errLevel,
		inserted: new Date()
	})

	// send email, check last send email per evitare flood (check last send email in collection con TTL / creare variabile che rimane disponibile ad ogni chiamata di questa funzione (lastSendEmail ?))
	// check db con config, es: admin imposta blocca invio email xke sta sistemando il problema

	// return newThrowError.save()
}
