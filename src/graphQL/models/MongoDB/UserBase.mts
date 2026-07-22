import { model, Schema, Types } from 'mongoose'

export interface IInfoUserForLogin {
	_id: Types.ObjectId
	login: {
		password: string
		lastLogin?: Date
	}
	account: {
		email: {
			valid: boolean
		}
		onboardingStep?: string
		onboardingDone?: boolean
		rememberMe?: boolean
		disabled?: boolean
		deleted?: boolean
	}
}

export interface IUserBaseSchema {
	_id: Types.ObjectId
	login: {
		_id?: boolean
		email: string
		password: string
		firstLogin?: Date
		lastLogin?: Date
	}
	account: {
		_id?: boolean
		email: {
			_id?: boolean
			valid: boolean
			dateLastReq?: Date
			requestTimes?: number
			hash?: string
			newEmailTmp?: string
		}
		onboardingStep?: string
		onboardingDone?: boolean
		rememberMe?: boolean
		registrationDate: Date
		accountValidDate?: Date
		newsletter?: boolean
		resetDateReq?: Date
		/**
		 * Password-reset token. Deliberately NOT `account.email.hash`: that slot belongs to the
		 * email-verification and email-change flows, which have a different lifetime (3 days vs 60
		 * minutes), a different throttle, and a different trust domain. While the two shared one
		 * field, requesting a reset silently invalidated a pending activation link, and a hash
		 * issued by either flow was accepted by the other.
		 */
		resetHash?: string
		disabled?: boolean
		deleted?: boolean
	}
	personalData?: {
		_id: false
		name: string
	}
	__v?: number
}

const UserBaseSchema: Schema<IUserBaseSchema> = new Schema(
	{
		login: {
			type: {
				_id: false,
				email: {
					type: String,
					required: true
				},
				password: {
					type: String,
					required: true
				},
				firstLogin: {
					type: Date,
					required: false
				},
				lastLogin: {
					type: Date,
					required: false
				}
			},
			required: true
		},
		account: {
			type: {
				_id: false,
				email: {
					type: {
						_id: false,
						valid: {
							type: Boolean,
							required: true
						},
						dateLastReq: {
							type: Date,
							required: false
						},
						requestTimes: {
							type: Number,
							required: false
						},
						hash: {
							type: String,
							required: false
						},
						newEmailTmp: {
							type: String,
							required: false
						}
					},
					required: true
				},
				onboardingStep: {
					type: String,
					required: false
				},
				onboardingDone: {
					type: Boolean,
					required: false
				},
				rememberMe: {
					type: Boolean,
					required: false
				},
				registrationDate: {
					type: Date,
					required: true
				},
				accountValidDate: {
					type: Date,
					required: false
				},
				newsletter: {
					type: Boolean,
					required: false
				},
				resetDateReq: {
					type: Date,
					required: false
				},
				resetHash: {
					type: String,
					required: false
				},
				disabled: {
					type: String,
					required: false
				},
				deleted: {
					type: Boolean,
					required: false
				}
			},
			required: true
		},
		personalData: {
			type: {
				_id: false,
				name: {
					type: String,
					required: true
				}
			},
			required: false
		},
		__v: {
			type: Number,
			required: false
		}
	},
	{
		collection: 'user'
	}
)

const UserBase = model<IUserBaseSchema>('UserBase', UserBaseSchema)
export { UserBase }
