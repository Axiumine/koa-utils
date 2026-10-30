import { DevStatsGraphQLCalls } from '@models/MongoDB/log/DevStatsGraphQLCalls.mjs'

export const hitStat = async function (call: string) {
	// get last document of stats
	const ret = await DevStatsGraphQLCalls.find({}).select('_id').sort({ dataora: -1 }).limit(1).lean()
	// empty collection: doc stays undefined and `doc._id` below throws a TypeError, as before noUncheckedIndexedAccess
	const doc = ret[0] as (typeof ret)[number]

	// set true for this call
	return DevStatsGraphQLCalls.updateOne({ _id: doc._id, 'list.name': call }, { 'list.$.hit': true }, { runValidators: true })
}
