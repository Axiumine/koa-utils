import { model, Schema, Types } from 'mongoose'

interface IStatsGraphqlSchema {
	_id: Types.ObjectId;
	u: number; // user
	n: string; // query name
	i: Date; // inserted
	s: number; // status
	m: number; // msTot
	__v?: number;
}

const StatsGraphqlSchema = new Schema<IStatsGraphqlSchema>(
	{
		u: {
			type: Number,
			required: true
		},
		n: {
			type: String,
			required: true
		},
		s: {
			type: Number,
			required: true
		},
		m: {
			type: Number,
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
		collection: 'logStatsGraphql'
	}
)

const LogStatsGraphql = model<IStatsGraphqlSchema>(
	'LogStatsGraphql',
	StatsGraphqlSchema
)
export { LogStatsGraphql }
