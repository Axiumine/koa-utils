import { model, Schema, Types } from 'mongoose'

export interface IGlobalErrorGraphqlSchema {
	_id: Types.ObjectId;
	m: string; // message
	s: Array<string>; // stack
	i: Date; // inserted
	__v?: number;
}

const GlobalErrorGraphqlSchema = new Schema<IGlobalErrorGraphqlSchema>(
	{
		m: {
			type: String,
			required: true
		},
		s: {
			type: [String],
			required: true
		},
		i: {
			type: Date,
			required: false,
			default: () => new Date() // Ensure a new Date is generated for each document.
		},
		__v: {
			type: Number,
			required: false
		}
	},
	{
		collection: 'logGlobalError'
	}
)

const LogGlobalError = model<IGlobalErrorGraphqlSchema>(
	'LogGlobalError',
	GlobalErrorGraphqlSchema
)
export { LogGlobalError }
