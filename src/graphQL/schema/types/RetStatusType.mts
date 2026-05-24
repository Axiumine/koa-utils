import { GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'

export const RetStatusType = new GraphQLObjectType({
	name: 'RetStatusType',
	fields: () => ({
		status: { type: new GraphQLNonNull(GraphQLString) }
	})
})
