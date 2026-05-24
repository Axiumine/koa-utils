import { GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'

export const RetStatusMexType = new GraphQLObjectType({
	name: 'RetStatusMexType',
	fields: () => ({
		status: { type: new GraphQLNonNull(GraphQLString) },
		mex: { type: GraphQLString }
	})
})
