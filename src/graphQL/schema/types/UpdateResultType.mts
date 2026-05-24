import { GraphQLInt, GraphQLNonNull, GraphQLObjectType } from 'graphql' // returns null id if it fails to save

// returns null id if it fails to save
export const UpdateResultType = new GraphQLObjectType({
	name: 'UpdateResultType',
	fields: () => ({
		modifiedCount: { type: new GraphQLNonNull(GraphQLInt) }
	})
})
