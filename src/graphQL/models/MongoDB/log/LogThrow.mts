import { model, Schema, Types } from 'mongoose'

export interface ILogThrowGraphqlSchema {
	_id: Types.ObjectId
	u: number // user
	m: string // message
	el: number // error level
	i: Date // inserted
	__v?: number
}

const LogThrowGraphqlSchema = new Schema<ILogThrowGraphqlSchema>(
	{
		u: {
			type: Number,
			required: true
		},
		m: {
			type: String,
			required: true
		},
		el: {
			type: Number,
			required: true
		},
		i: {
			type: Date,
			required: false,
			default: () => new Date() // Ensure a new Date is generated for each document.
		},
		__v: {
			type: Number
		}
	},
	{
		collection: 'logThrow'
	}
)

const LogThrow = model<ILogThrowGraphqlSchema>('LogThrow', LogThrowGraphqlSchema)
export { LogThrow }
