import { model, Schema, Types } from 'mongoose'

export interface IDevStatsGraphQLCalls {
	name: string;
	hit?: boolean;
}

export interface IDevStatsGraphQLCallsSchema {
	_id: Types.ObjectId;
	list: [
		{
			_id?: Types.ObjectId;
			name: string;
			hit?: boolean;
		},
	];
	dataora: Date;
	__v?: number;
}

const DevStatsGraphQLCallsSchema = new Schema<IDevStatsGraphQLCallsSchema>(
	{
		list: {
			type: [
				{
					_id: {
						type: Schema.Types.ObjectId,
						required: true
					},
					name: {
						type: String,
						required: true
					},
					hit: {
						type: Boolean,
						required: false
					}
				}
			],
			required: true
		},
		dataora: {
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
		collection: 'devStatsGraphQLCalls'
	}
)

const DevStatsGraphQLCalls = model<IDevStatsGraphQLCallsSchema>(
	'DevStatsGraphQLCalls',
	DevStatsGraphQLCallsSchema
)
export { DevStatsGraphQLCalls }
