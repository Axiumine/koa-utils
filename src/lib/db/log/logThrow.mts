import { LogThrow } from '@models/MongoDB/log/LogThrow.mjs'
import { Types } from 'mongoose'

// const lastSendEmail = new Date();

export const logThrow = function (log: string, errLevel: number) {
	new LogThrow({
		_id: new Types.ObjectId(),
		message: log,
		errLevel,
		inserted: new Date()
	})

	// send email, check last send email to avoid flooding (check last send email in collection with TTL / create a variable that stays available on every call to this function (lastSendEmail ?))
	// check db with config, e.g.: admin sets block on sending email because they're fixing the problem

	// return newThrowError.save()
}
