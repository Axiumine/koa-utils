// @todo report on Sentry
import { UserBase } from '@models/MongoDB/UserBase.mjs'

export default async function deleteUserByEmail(email: string) {
	await UserBase.deleteOne({ 'login.email': email })

	/* if (ret.deletedCount === 0) {
  } */
}
