import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'

interface ISet {
	login?: {
		firstLogin?: Date
		lastLogin?: Date
	}
}

export async function updateLoginStats4ever(id: Types.ObjectId, lastLogin: null | Date, session: ClientSession) {
	const now = new Date()

	// update last login
	const dbSet: ISet = {}

	// @ts-expect-error avoid any
	dbSet['login.lastLogin'] = now

	// set firstLogin if this is the first login.
	if (lastLogin === null) {
		// @ts-expect-error avoid any
		dbSet['login.firstLogin'] = now
	} else {
		// not the first login
	}

	await UserBase.updateOne({ _id: id }, { $set: dbSet }, { session, runValidators: true })
}
