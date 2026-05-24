import { GraphQLBoolean, GraphQLNonNull, GraphQLObjectType } from 'graphql'

const FindOneAndUpdateDetailType = new GraphQLObjectType({
	name: 'FindOneAndUpdateDetailType',
	fields: () => ({
		updatedExisting: { type: new GraphQLNonNull(GraphQLBoolean) }
	})
})

// I ignore the other data
export const FindOneAndUpdateType = new GraphQLObjectType({
	name: 'FindOneAndUpdateType',
	fields: () => ({
		lastErrorObject: { type: new GraphQLNonNull(FindOneAndUpdateDetailType) }
	})
})
