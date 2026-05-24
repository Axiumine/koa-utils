import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { ClientSession, Types } from 'mongoose'

interface ISet {
	login?: {
		firstLogin?: Date;
		lastLogin?: Date;
	};
	account?: {
		rememberMe: boolean;
	};
}

interface IUnset {
	account?: {
		rememberMe: number;
	};
}

export async function updateLoginStatsRememberme(
	id: Types.ObjectId,
	lastLogin: null | Date,
	rememberMe: boolean,
	session: ClientSession
) {
	const now = new Date()

	// update last login
	const dbSet: ISet = {}
	const dbUnset: IUnset = {}

	// @ts-expect-error avoid any
	dbSet['login.lastLogin'] = now

	// set firstLogin if this is the first login.
	if (lastLogin === null) {
		// @ts-expect-error avoid any
		dbSet['login.firstLogin'] = now
	} else {
		// not the first login
	}

	if (rememberMe) {
		// @ts-expect-error avoid any
		dbSet['account.rememberMe'] = true
	} else {
		// @ts-expect-error avoid any
		dbUnset['account.rememberMe'] = 1
	}

	await UserBase.updateOne(
		{ _id: id },
		{ $set: dbSet, $unset: dbUnset },
		{ session, runValidators: true }
	)
}
