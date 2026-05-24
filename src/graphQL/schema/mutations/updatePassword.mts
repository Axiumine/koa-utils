import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { checkPwdLen } from '@lib/checkPwdLen.mjs'
import { DateLib } from '@lib/DateLib.mjs'
import { tryCatchRethrow } from '@lib/tryCatchRethrow.mjs'
import { getResetPwd } from '@private/lib/access/db/getResetPwd.mjs'
import removeResetReq from '@private/lib/access/db/removeResetReq.mjs'
import updatePasswordDb from '@private/lib/access/db/updatePasswordDb.mjs'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { GraphQLBoolean, GraphQLError, GraphQLNonNull, GraphQLString } from 'graphql'
import mongoose from 'mongoose'

interface IArgs {
	email: string;
	hash: string;
	password: string;
}

export const updatePassword = {
	description: 'cambia la password all\'utente',
	type: new GraphQLNonNull(GraphQLBoolean),
	args: {
		email: { type: new GraphQLNonNull(GraphQLString) },
		hash: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	},
	async resolve(_: unknown, args: IArgs) {
		const { email, hash, password } = args

		const uEmail = email.trim().toLowerCase()
		checkEmailLen(uEmail)
		checkPwdLen(password)

		const session = await mongoose.startSession()

		try {
			await session.withTransaction(async () => {
				const resetPwd = await getResetPwd(session, uEmail)

				// test se email presente nel db
				if (resetPwd === null) {
					throw throwForbiddenError() // non facciamo sapere che l'email non è presente, per privacy
				}
				// console.debug('--email presente')

				if (resetPwd.resetHash === null) {
					throw throwInternalError()
				}
				if (resetPwd.resetDateReq === null) {
					throw throwInternalError() // throwSoftwareError('resetDateReq mancante !')
				}

				// test se hash non presente o non valido
				if (resetPwd.resetHash !== hash) {
					throw throwForbiddenError() // non facciamo sapere che l'email non è presente, per privacy
				} // else console.debug('--hash valido')

				// test se richiesta richiesta entro 1 ora
				const dt1 = new Date('' + resetPwd.resetDateReq)
				if (DateLib.minElapsed(dt1) > 60) {
					throw throwForbiddenError() // Il link non è più valido
				} // else console.debug('--link valido')

				const update = await updatePasswordDb(session, resetPwd._id, password)
				if (!update) {
					throw throwInternalError() // "Errore di sistema nell'aggiornamento della password."
				} // else console.debug('--pwd aggiornata')

				// cancella dati nel db di richiesta pwd
				await removeResetReq(session, uEmail)

				// invia email conferma nuova pwd
				const SocketLabsObj = new SocketLabsLib()
				await SocketLabsObj.sendConfermaResetPwd(uEmail, resetPwd.name)
			})
		} catch (e: unknown) {
			tryCatchRethrow(e as GraphQLError | Error)
		} finally {
			await session.endSession()
		}

		return true
	}
}
