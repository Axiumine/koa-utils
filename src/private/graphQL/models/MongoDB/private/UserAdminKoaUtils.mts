import { model, Schema, Types } from 'mongoose'

export interface IInfoUserAdminForLogin {
	_id: Types.ObjectId
	login: {
		password: string
		lastLogin?: Date
	}
	account: {
		email: {
			valid: boolean
		}
		rememberMe?: boolean
		disabled?: boolean
		deleted?: boolean
	}
}

export interface IUserAdminKoaUtilsSchema {
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
		rememberMe?: boolean
		registrationDate: Date
		accountValidDate?: Date
		newsletter?: boolean
		resetDateReq?: Date
		disabled?: boolean
		deleted?: boolean
	}
	personalData: {
		_id: false
		name: string
		surname: string
	}
	__v?: number
}

const UserAdminKoaUtilsSchema: Schema<IUserAdminKoaUtilsSchema> = new Schema(
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
				// Boolean, matching IUserAdminKoaUtilsSchema — same fix as UserBase. As String, a
				// stored `false` hydrated to the truthy string 'false' and infoUserAdminForLogin
				// locked out admins who were explicitly not disabled. Existing rows need
				// scripts/migrate-account-disabled-to-boolean.mjs, which covers this collection too.
				disabled: {
					type: Boolean,
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
				},
				surname: {
					type: String,
					required: true
				}
			},
			required: true
		},
		__v: {
			type: Number,
			required: false
		}
	},
	{
		collection: 'userAdmin'
	}
)

export default model<IUserAdminKoaUtilsSchema>('UserAdminKoaUtils', UserAdminKoaUtilsSchema)
