import { model, Schema, Types } from 'mongoose'

export interface IInfoUserForLogin {
	_id: Types.ObjectId;
	login: {
		password: string;
		lastLogin?: Date;
	};
	account: {
		email: {
			valid: boolean;
		};
		onboardingStep?: string;
		onboardingDone?: boolean;
		rememberMe?: boolean;
		disabled?: boolean;
		deleted?: boolean;
	};
}

export interface IUserBaseSchema {
	_id: Types.ObjectId;
	login: {
		_id?: boolean;
		email: string;
		password: string;
		firstLogin?: Date;
		lastLogin?: Date;
	};
	account: {
		_id?: boolean;
		email: {
			_id?: boolean;
			valid: boolean;
			dateLastReq?: Date;
			requestTimes?: number;
			hash?: string;
			newEmailTmp?: string;
		};
		onboardingStep?: string;
		onboardingDone?: boolean;
		rememberMe?: boolean;
		registrationDate: Date;
		accountValidDate?: Date;
		newsletter?: boolean;
		resetDateReq?: Date;
		disabled?: boolean;
		deleted?: boolean;
	};
	personalData?: {
		_id: false;
		name: string;
	};
	__v?: number;
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
