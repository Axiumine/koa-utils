import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { EMAIL_HASH_LEN } from '@lib/Constants.mjs'
import { DateLib } from '@lib/DateLib.mjs'
import { StringLib } from '@lib/StringLib.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { getResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import { saveResetReq } from '@private/lib/access/db/saveResetReq.mjs'
import { throwTooManyRequestsError } from '@throw/throwTooManyRequestsError.mjs'
import { GraphQLBoolean, GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string;
}

/**
 * Take the user email and send an email with a link for change the password.
 * for privacy, true is returned if given email do not exist
 */
export const resetPwd = {
	description: 'send reset password link',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs) {
		const { email } = args

		const uEmail = email.toLowerCase().trim()
		checkEmailLen(uEmail)

		const session = await mongoose.startSession()
		try {
			await session.withTransaction(async () => {
				// console.debug('email esiste ?')
				// email esiste ? -> recupera se ci sono gia state richieste di reset -> return 4xx ??
				const resetPwdVal = await getResetPwd(session, uEmail)

				// non facciamo sapere che l'email non è presente, per privacy
				if (resetPwdVal !== null) {
					// console.debug("l'email esiste")

					// ok email esiste

					// -> attendi 10 minuti dall'ultima richiesta di reset della password

					// se c'è già una richiesta di password, legge la data in secondi.
					const lastReq =
						typeof resetPwdVal.resetDateReq !== 'undefined'
							? new Date('' + resetPwdVal.resetDateReq)
							: null

					// richiesta già fatta in precedenza ?
					//  invia nuova email con link di recupero se inviata meno di 10 minuti fa'
					let elapsedMin = 0
					const nowDt = new Date()

					let calculateHash = false
					if (lastReq !== null) {
						// console.debug('richiesta di reset gia eseguita')
						elapsedMin = DateLib.minElapsed(lastReq)

						// console.debug('precedente richiesta di reset della pwd: ' + lastReq + ' ora sono le ' + now + ' e sono passati ' + elapsedMin + ' minuti')
						// se c'è gia stata una richiesta di reset pwd, devono essere passati almeno 10 minuti
						if (elapsedMin < 10) {
							// console.debug('last req < 10 min')
							// Non facciamo sapere che l'email è stata trovata e
							elapsedMin = 10 - elapsedMin
							if (elapsedMin < 0) elapsedMin = 1 // per arrotondare i secondi dell'ultimo minuto, imposta minuto = 1
							// console.debug('wait ' + message + ' min ' + uEmail)
							throw throwTooManyRequestsError(elapsedMin.toString())
						} else {
							// ok, maggiore di 10 minuti, allora genera hash per nuova email
							calculateHash = true
						}
					} else {
						//console.debug('prima richiesta di reset')
						calculateHash = true
					}

					if (calculateHash) {
						// genera hash x reset pwd
						const StrObj = new StringLib()
						const hash = StrObj.randomString(EMAIL_HASH_LEN)

						// imposta hash e data attuale di reset
						await saveResetReq(session, resetPwdVal._id, nowDt, hash)

						// invia email con nuovo hash, ultima req > 10 minuti
						const SocketLabsObj = new SocketLabsLib()
						await SocketLabsObj.sendEmailReset(uEmail, hash, resetPwdVal.name)
					} // calculateHash & sendEmail
				}
			})
		} catch (e: unknown) {
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}


		return true
	}
}

